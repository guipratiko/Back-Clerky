import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Instance from '../models/Instance';
import { generateInstanceName } from '../utils/instanceGenerator';
import { requestEvolutionAPI } from '../utils/evolutionAPI';
import { getIO } from '../socket/socketServer';
import { AuthRequest } from '../middleware/auth';
import { validateAndConvertUserId } from '../utils/helpers';
import { WEBHOOK_CONFIG, EVOLUTION_CONFIG } from '../config/constants';
import { createValidationError, createNotFoundError, handleControllerError } from '../utils/errorHelpers';
import { formatInstanceResponse } from '../utils/instanceFormatters';
import { pgPool } from '../config/databases';
import { redisClient } from '../config/databases';

interface CreateInstanceBody {
  name: string; // Nome escolhido pelo usuário
  rejectCall?: boolean;
  groupsIgnore?: boolean;
  alwaysOnline?: boolean;
  readMessages?: boolean;
  readStatus?: boolean;
}

interface UpdateSettingsBody {
  rejectCall?: boolean;
  groupsIgnore?: boolean;
  alwaysOnline?: boolean;
  readMessages?: boolean;
  readStatus?: boolean;
  syncFullHistory?: boolean;
}

// Tipo para instância do MongoDB (lean) - usando Record para flexibilidade
export type InstanceLean = Record<string, any> & {
  _id: mongoose.Types.ObjectId;
  name?: string;
  instanceName?: string;
  instanceId?: string | null;
  token?: string;
  qrcode?: boolean;
  qrcodeBase64?: string | null;
  status?: 'created' | 'connecting' | 'connected' | 'disconnected' | 'error';
  integration?: string;
  webhook?: {
    url?: string;
    events?: Record<string, boolean>;
  };
  rejectCall?: boolean;
  groupsIgnore?: boolean;
  alwaysOnline?: boolean;
  readMessages?: boolean;
  readStatus?: boolean;
  syncFullHistory?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};


/**
 * Cria uma nova instância na Evolution API
 */
export const createInstance = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const userObjectId = validateAndConvertUserId(userId);

    const {
      name,
      rejectCall = false,
      groupsIgnore = false,
      alwaysOnline = false,
      readMessages = false,
      readStatus = false,
    }: CreateInstanceBody = req.body;

    // Validar nome
    if (!name || name.trim().length < 3) {
      return next(createValidationError('Nome deve ter no mínimo 3 caracteres'));
    }

    // Gerar nome aleatório para a instância
    let instanceName = generateInstanceName();

    // Verificar se já existe
    let existingInstance = await Instance.findOne({ instanceName });
    while (existingInstance) {
      instanceName = generateInstanceName();
      existingInstance = await Instance.findOne({ instanceName });
    }

    // Configurar webhook URL
    const webhookUrl = `${WEBHOOK_CONFIG.BASE_URL}/${instanceName}`;
    const webhookEvents: string[] = WEBHOOK_CONFIG.EVENTS;

    // Payload para a Evolution API (formato flat - settings direto no payload)
    const payload = {
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      rejectCall,
      groupsIgnore,
      alwaysOnline,
      readMessages,
      readStatus,
      syncFullHistory: true,
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: WEBHOOK_CONFIG.BASE64,
        headers: {
          Authorization: 'Bearer TOKEN',
          'Content-Type': 'application/json',
        },
        events: webhookEvents,
      },
    };

    // Criar instância na Evolution API
    const evolutionResponse = await requestEvolutionAPI('POST', '/instance/create', payload);

    // Extrair dados da resposta
    const qrcodeBase64 = evolutionResponse.data?.qrcode?.base64 || null;
    const instanceId = evolutionResponse.data?.instance?.instanceId || null;
    const hash = evolutionResponse.data?.hash || null;
    const evolutionStatus = evolutionResponse.data?.instance?.status || 'created';

    // Mapear status
    let status: 'created' | 'connecting' | 'connected' | 'disconnected' | 'error' = 'created';
    if (evolutionStatus === 'connecting') status = 'connecting';
    else if (evolutionStatus === 'open') status = 'connected';
    else if (evolutionStatus === 'close') status = 'disconnected';
    else if (evolutionStatus === 'error') status = 'error';

    // As configurações já foram enviadas no payload de criação (formato flat)
    // Não é necessário fazer uma chamada adicional de settings

    // Criar objeto de eventos para salvar no banco
    const webhookEventsObj: Record<string, boolean> = {};
    webhookEvents.forEach((event) => {
      webhookEventsObj[event] = true;
    });

    // Salvar instância no banco de dados
    // O token será gerado automaticamente pelo modelo (pre-save hook)
    const instance = new Instance({
      instanceName, // Nome interno gerado automaticamente
      name: name.trim(), // Nome escolhido pelo usuário
      userId: userObjectId,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      rejectCall,
      groupsIgnore,
      alwaysOnline,
      readMessages,
      readStatus,
      syncFullHistory: true,
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: WEBHOOK_CONFIG.BASE64,
        headers: {
          'Content-Type': 'application/json',
        },
        events: webhookEventsObj,
      },
      qrcodeBase64,
      instanceId,
      hash,
      status,
    });

    await instance.save();

    // Emitir evento via WebSocket para atualizar status em tempo real
    try {
      const io = getIO();
      if (!userId) {
        throw new Error('Usuário não encontrado');
      }
      const userIdStr = userId.toString();
      const instanceIdStr = instance._id.toString();
      console.log(`📤 [Controller] Emitindo evento para usuário ${userIdStr}: instância ${instanceIdStr} -> status ${status}`);
      io.to(userIdStr).emit('instance-status-updated', {
        instanceId: instanceIdStr,
        status: status,
      });
    } catch (socketError) {
      console.error('❌ Erro ao emitir evento WebSocket:', socketError);
      // Ignorar erro se socket não estiver inicializado
    }

    res.status(201).json({
      status: 'success',
      message: 'Instância criada com sucesso',
      instance: formatInstanceResponse(instance as any),
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao criar instância'));
  }
};

/**
 * Lista todas as instâncias do usuário
 */
export const getInstances = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const userObjectId = validateAndConvertUserId(userId);

    const instances = await Instance.find({ userId: userObjectId })
      .select('-__v')
      .sort({ createdAt: -1 })
      .lean();

    const formattedInstances = instances.map((instance: InstanceLean) => formatInstanceResponse(instance));

    res.status(200).json({
      status: 'success',
      count: formattedInstances.length,
      instances: formattedInstances,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao buscar instâncias'));
  }
};

/**
 * Obtém uma instância específica
 */
export const getInstance = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const userObjectId = validateAndConvertUserId(userId);

    const instance = await Instance.findOne({ _id: id, userId: userObjectId }).lean() as InstanceLean | null;

    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    const webhookEvents = instance.webhook?.events || {};
    const activeEvents = Object.keys(webhookEvents).filter((key) => webhookEvents[key] === true);

    res.status(200).json({
      status: 'success',
      instance: formatInstanceResponse(instance),
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao obter instância'));
  }
};

/**
 * Atualiza as configurações de uma instância
 */
export const updateInstanceSettings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const settings: UpdateSettingsBody = req.body;

    const userObjectId = validateAndConvertUserId(userId);

    const instance = await Instance.findOne({ _id: id, userId: userObjectId });

    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    // Atualizar settings na Evolution API
    const settingsPath = EVOLUTION_CONFIG.SETTINGS_PATH.replace(
      '{instance}',
      encodeURIComponent(instance.instanceName)
    );

    try {
      // Tentar POST primeiro, se falhar, tentar PUT
      try {
        await requestEvolutionAPI('POST', settingsPath, settings);
      } catch (postError: any) {
        if (postError.message?.includes('405')) {
          await requestEvolutionAPI('PUT', settingsPath, settings);
        } else {
          throw postError;
        }
      }
    } catch (apiError: any) {
      // Log do erro mas continua atualizando no banco
      console.error('Erro ao atualizar settings na Evolution API:', apiError.message);
    }

    // Atualizar no banco de dados
    if (settings.rejectCall !== undefined) instance.rejectCall = settings.rejectCall;
    if (settings.groupsIgnore !== undefined) instance.groupsIgnore = settings.groupsIgnore;
    if (settings.alwaysOnline !== undefined) instance.alwaysOnline = settings.alwaysOnline;
    if (settings.readMessages !== undefined) instance.readMessages = settings.readMessages;
    if (settings.readStatus !== undefined) instance.readStatus = settings.readStatus;
    if (settings.syncFullHistory !== undefined) instance.syncFullHistory = settings.syncFullHistory;

    await instance.save();

    res.status(200).json({
      status: 'success',
      message: 'Configurações atualizadas com sucesso',
      instance: {
        id: instance._id.toString(),
        instanceName: instance.instanceName,
        settings: {
          rejectCall: instance.rejectCall,
          groupsIgnore: instance.groupsIgnore,
          alwaysOnline: instance.alwaysOnline,
          readMessages: instance.readMessages,
          readStatus: instance.readStatus,
          syncFullHistory: instance.syncFullHistory,
        },
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao atualizar configurações da instância'));
  }
};

/**
 * Deleta uma instância e todos os dados relacionados
 */
export const deleteInstance = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const userObjectId = validateAndConvertUserId(userId);

    const instance = await Instance.findOne({ _id: id, userId: userObjectId });

    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    const instanceId = id.toString();

    console.log(`🗑️  Iniciando exclusão da instância ${instanceId} e todos os dados relacionados...`);

    // 1. Deletar dados do PostgreSQL relacionados à instância
    try {
      const client = await pgPool.connect();
      
      try {
        // Deletar em ordem para respeitar foreign keys
        // Ordem: deletar tabelas dependentes primeiro, depois as principais
        
        // 1. dispatch_jobs (depende de dispatches - será deletado via CASCADE, mas deletamos diretamente por segurança)
        await client.query('DELETE FROM dispatch_jobs WHERE dispatch_id IN (SELECT id FROM dispatches WHERE instance_id = $1)', [instanceId]);
        
        // 2. dispatches
        await client.query('DELETE FROM dispatches WHERE instance_id = $1', [instanceId]);
        
        // 3. workflow_contacts (depende de workflows - será deletado via CASCADE, mas deletamos diretamente por instance_id para garantir)
        await client.query('DELETE FROM workflow_contacts WHERE instance_id = $1', [instanceId]);
        
        // 4. openai_memory (depende de workflows - será deletado via CASCADE, mas deletamos diretamente por instance_id para garantir)
        await client.query('DELETE FROM openai_memory WHERE instance_id = $1', [instanceId]);
        
        // 5. workflows
        await client.query('DELETE FROM workflows WHERE instance_id = $1', [instanceId]);
        
        // 6. ai_agents
        await client.query('DELETE FROM ai_agents WHERE instance_id = $1', [instanceId]);
        
        // 7. messages (depende de contacts - será deletado via CASCADE, mas deletamos diretamente por instance_id para garantir)
        await client.query('DELETE FROM messages WHERE instance_id = $1', [instanceId]);
        
        // 8. contacts (deletar por último, pois messages depende dele)
        await client.query('DELETE FROM contacts WHERE instance_id = $1', [instanceId]);
        
        console.log(`✅ Dados do PostgreSQL deletados para instância ${instanceId}`);
      } finally {
        client.release();
      }
    } catch (pgError: any) {
      console.error('❌ Erro ao deletar dados do PostgreSQL:', pgError.message);
      // Continuar mesmo se houver erro no PostgreSQL
    }

    // 2. Deletar dados do Redis relacionados à instância
    try {
      // Deletar memórias de AI agents
      const memoryPattern = `ai_agent:memory:${userId}:${instanceId}:*`;
      const memoryKeys = await redisClient.keys(memoryPattern);
      if (memoryKeys.length > 0) {
        await redisClient.del(...memoryKeys);
        console.log(`✅ ${memoryKeys.length} chave(s) de memória de AI agent deletada(s) do Redis`);
      }

      // Deletar cache de grupos
      const groupsCacheKey = `groups:${instance.instanceName}`;
      await redisClient.del(groupsCacheKey);
      console.log(`✅ Cache de grupos deletado do Redis`);

      // Deletar qualquer outro cache relacionado (se houver)
      const allInstanceKeys = await redisClient.keys(`*:${instanceId}*`);
      const allInstanceNameKeys = await redisClient.keys(`*:${instance.instanceName}*`);
      const allKeysToDelete = [...new Set([...allInstanceKeys, ...allInstanceNameKeys])];
      
      if (allKeysToDelete.length > 0) {
        await redisClient.del(...allKeysToDelete);
        console.log(`✅ ${allKeysToDelete.length} chave(s) adicional(is) deletada(s) do Redis`);
      }
    } catch (redisError: any) {
      console.error('❌ Erro ao deletar dados do Redis:', redisError.message);
      // Continuar mesmo se houver erro no Redis
    }

    // 3. Deletar instância na Evolution API
    try {
      await requestEvolutionAPI('DELETE', `/instance/delete/${encodeURIComponent(instance.instanceName)}`);
      console.log(`✅ Instância deletada na Evolution API`);
    } catch (apiError: any) {
      // Log do erro mas continua deletando do banco
      console.error('⚠️  Erro ao deletar instância na Evolution API:', apiError.message);
    }

    // 4. Deletar instância do MongoDB (por último)
    await Instance.deleteOne({ _id: id, userId: userObjectId });
    console.log(`✅ Instância deletada do MongoDB`);

    // 5. Emitir evento WebSocket para atualizar frontend
    try {
      const io = getIO();
      io.to(userId).emit('instance-deleted', { instanceId: id });
    } catch (wsError) {
      console.error('⚠️  Erro ao emitir evento WebSocket:', wsError);
    }

    res.status(200).json({
      status: 'success',
      message: 'Instância e todos os dados relacionados foram deletados com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao deletar instância'));
  }
};


