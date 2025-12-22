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
 * Deleta uma instância
 */
export const deleteInstance = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const userObjectId = validateAndConvertUserId(userId);

    const instance = await Instance.findOne({ _id: id, userId: userObjectId });

    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    // Deletar instância na Evolution API
    try {
      await requestEvolutionAPI('DELETE', `/instance/delete/${encodeURIComponent(instance.instanceName)}`);
    } catch (apiError: any) {
      // Log do erro mas continua deletando do banco
      console.error('Erro ao deletar instância na Evolution API:', apiError.message);
    }

    // Deletar do banco de dados
    await Instance.deleteOne({ _id: id, userId: userObjectId });

    res.status(200).json({
      status: 'success',
      message: 'Instância deletada com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao deletar instância'));
  }
};


