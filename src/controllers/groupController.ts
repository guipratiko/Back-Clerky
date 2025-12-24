/**
 * Controller para gerenciar Grupos do WhatsApp
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import Instance, { IInstance } from '../models/Instance';
import { requestEvolutionAPI } from '../utils/evolutionAPI';
import { uploadFileToService } from '../utils/mediaService';
import { normalizePhoneList } from '../utils/numberNormalizer';
import { validatePhoneNumbers } from '../services/contactValidationService';
// parseCSVFile não é usado aqui, apenas parseCSVText e parseInputText são usados no frontend
import multer from 'multer';
import {
  createValidationError,
  createNotFoundError,
  handleControllerError,
} from '../utils/errorHelpers';
import { emitGroupsUpdate } from '../socket/socketServer';
import { redisClient } from '../config/databases';

/**
 * Helper para buscar e validar instância
 * Retorna a instância se válida, ou chama next() com erro e retorna null
 */
async function getAndValidateInstance(
  instanceId: string,
  userId: string,
  next: NextFunction
): Promise<IInstance | null> {
  const instance = await Instance.findById(instanceId);
  
  if (!instance) {
    next(createNotFoundError('Instância'));
    return null;
  }

  if (instance.userId.toString() !== userId) {
    next(createValidationError('Instância não pertence ao usuário'));
    return null;
  }

  return instance;
}

/**
 * Helper para invalidar cache de grupos e emitir atualização via WebSocket
 */
async function invalidateGroupsCacheAndEmitUpdate(
  instanceName: string,
  userId: string,
  instanceId: string
): Promise<void> {
  try {
    const cacheKey = `groups:${instanceName}`;
    await redisClient.del(cacheKey);
    emitGroupsUpdate(userId, instanceId);
  } catch (socketError) {
    console.error('❌ Erro ao invalidar cache e emitir evento WebSocket de grupos:', socketError);
    // Não lançar erro, apenas logar, pois é uma operação auxiliar
  }
}

export interface GroupParticipant {
  id: string;
  name?: string;
  isAdmin?: boolean;
}

export interface Group {
  id: string;
  name?: string;
  description?: string;
  creation?: number;
  participants?: GroupParticipant[];
  pictureUrl?: string;
  announcement?: boolean; // true = only admins, false = all members
  locked?: boolean; // true = only admins edit, false = all members edit
}

// Configuração do multer para upload de imagem
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas (JPEG, PNG, GIF, WEBP)'));
    }
  },
});

export const uploadGroupImage = upload.single('image');

/**
 * Obter todos os grupos de uma instância
 * GET /api/groups?instanceId=xxx
 */
export const getAllGroups = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { instanceId } = req.query;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!instanceId || typeof instanceId !== 'string') {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    // Buscar e validar instância
    const instance = await getAndValidateInstance(instanceId, userId, next);
    if (!instance) return;

    // Cache key
    const cacheKey = `groups:${instance.instanceName}`;
    const CACHE_TTL = 30; // 30 segundos de cache

    // Tentar buscar do cache primeiro
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        const cachedData = JSON.parse(cached);
        console.log(`📦 Cache hit: ${cacheKey}`);
        res.status(200).json({
          status: 'success',
          groups: cachedData.groups || [],
          count: cachedData.count || 0,
          cached: true,
        });
        return;
      }
    } catch (cacheError) {
      console.error('Erro ao buscar cache de grupos:', cacheError);
      // Continuar para buscar da API
    }

    // Buscar grupos na Evolution API
    try {
      const response = await requestEvolutionAPI(
        'GET',
        `/group/fetchAllGroups/${encodeURIComponent(instance.instanceName)}?getParticipants=true`
      );

      // Mapear grupos para o formato esperado
      const groups: Group[] = (response.data || []).map((group: any) => ({
        id: group.id || group.groupId || '',
        name: group.subject || group.name,
        description: group.description,
        creation: group.creation ? parseInt(group.creation) : undefined,
        participants: group.participants
          ? group.participants.map((p: any) => ({
              id: p.id || p.jid || '',
              name: p.name || p.pushName,
              isAdmin: p.isAdmin || p.admin || false,
            }))
          : [],
        pictureUrl: group.pictureUrl || group.picture || group.groupPicture || undefined,
        announcement: group.announcement !== undefined ? Boolean(group.announcement) : undefined,
        locked: group.locked !== undefined ? Boolean(group.locked) : undefined,
      }));

      // Salvar no cache
      try {
        await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify({ groups, count: groups.length }));
        console.log(`💾 Cache salvo: ${cacheKey} (TTL: ${CACHE_TTL}s)`);
      } catch (cacheError) {
        console.error('Erro ao salvar cache de grupos:', cacheError);
        // Continuar mesmo se o cache falhar
      }

      res.status(200).json({
        status: 'success',
        groups,
        count: groups.length,
      });
    } catch (evolutionError: any) {
      console.error('Erro ao buscar grupos na Evolution API:', evolutionError);
      
      // Se for erro de rate limit, tentar retornar do cache mesmo que expirado
      if (evolutionError.message?.includes('rate-overlimit') || 
          evolutionError.response?.response?.message === 'rate-overlimit') {
        try {
          const cached = await redisClient.get(cacheKey);
          if (cached) {
            const cachedData = JSON.parse(cached);
            console.log(`📦 Retornando cache devido a rate limit: ${cacheKey}`);
            res.status(200).json({
              status: 'success',
              groups: cachedData.groups || [],
              count: cachedData.count || 0,
              cached: true,
            });
            return;
          }
        } catch (cacheError) {
          // Se não conseguir buscar do cache, retornar erro
        }
        
        return next(
          handleControllerError(
            evolutionError,
            'Limite de requisições excedido. Aguarde alguns segundos e tente novamente.'
          )
        );
      }
      
      // Para outros erros, retornar array vazio
      res.status(200).json({
        status: 'success',
        groups: [],
        count: 0,
      });
    }
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao obter grupos'));
  }
};

/**
 * Sair de um grupo
 * POST /api/groups/leave
 */
export const leaveGroup = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { instanceId, groupId } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!instanceId) {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    if (!groupId) {
      return next(createValidationError('ID do grupo é obrigatório'));
    }

    // Buscar e validar instância
    const instance = await getAndValidateInstance(instanceId, userId, next);
    if (!instance) return;

    // Sair do grupo na Evolution API
    try {
      await requestEvolutionAPI(
        'DELETE',
        `/group/leaveGroup/${encodeURIComponent(instance.instanceName)}`,
        {
          groupJid: groupId,
        }
      );

      // Invalidar cache e emitir evento via WebSocket
      await invalidateGroupsCacheAndEmitUpdate(instance.instanceName, userId, instanceId);

      res.status(200).json({
        status: 'success',
        message: 'Saiu do grupo com sucesso',
      });
    } catch (evolutionError: any) {
      console.error('Erro ao sair do grupo na Evolution API:', evolutionError);
      return next(
        handleControllerError(
          evolutionError,
          'Erro ao sair do grupo. Verifique se você tem permissão para sair.'
        )
      );
    }
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao sair do grupo'));
  }
};

/**
 * Validar participantes antes de criar grupo
 * POST /api/groups/validate-participants
 */
export const validateParticipants = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { instanceId, participants } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!instanceId) {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    if (!participants || !Array.isArray(participants)) {
      return next(createValidationError('Lista de participantes é obrigatória'));
    }

    if (participants.length === 0) {
      return next(createValidationError('Adicione pelo menos um participante'));
    }

    if (participants.length > 1024) {
      return next(createValidationError('Máximo de 1024 participantes permitidos'));
    }

    // Buscar e validar instância
    const instance = await getAndValidateInstance(instanceId, userId, next);
    if (!instance) return;

    // Normalizar números
    const phoneNumbers = participants.map((p: any) => (typeof p === 'string' ? p : p.phone || p.id)).filter(Boolean);
    const normalizedPhones = normalizePhoneList(phoneNumbers);

    if (normalizedPhones.length === 0) {
      return next(createValidationError('Nenhum número válido encontrado'));
    }

    // Validar números na Evolution API
    const validationResults = await validatePhoneNumbers(instance.instanceName, normalizedPhones);

    const valid = validationResults.filter((r) => r.exists);
    const invalid = validationResults.filter((r) => !r.exists);

    res.status(200).json({
      status: 'success',
      valid: valid.map((r) => ({
        phone: r.number,
        name: r.name,
      })),
      invalid: invalid.map((r) => ({
        phone: r.number,
        reason: 'Número não encontrado no WhatsApp',
      })),
      validCount: valid.length,
      invalidCount: invalid.length,
      totalCount: validationResults.length,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao validar participantes'));
  }
};

/**
 * Criar novo grupo
 * POST /api/groups/create
 */
export const createGroup = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { instanceId, subject, description, participants } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!instanceId) {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    if (!subject || subject.trim().length === 0) {
      return next(createValidationError('Nome do grupo é obrigatório'));
    }

    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      return next(createValidationError('Adicione pelo menos um participante'));
    }

    if (participants.length > 1024) {
      return next(createValidationError('Máximo de 1024 participantes permitidos'));
    }

    // Buscar e validar instância
    const instance = await getAndValidateInstance(instanceId, userId, next);
    if (!instance) return;

    // Normalizar números dos participantes
    const phoneNumbers = participants.map((p: any) => (typeof p === 'string' ? p : p.phone || p.id)).filter(Boolean);
    const normalizedPhones = normalizePhoneList(phoneNumbers);

    if (normalizedPhones.length === 0) {
      return next(createValidationError('Nenhum número válido encontrado'));
    }

    // Criar grupo na Evolution API
    try {
      const response = await requestEvolutionAPI(
        'POST',
        `/group/create/${encodeURIComponent(instance.instanceName)}`,
        {
          subject: subject.trim(),
          description: description?.trim() || '',
          participants: normalizedPhones,
        }
      );

      // Invalidar cache e emitir evento via WebSocket
      await invalidateGroupsCacheAndEmitUpdate(instance.instanceName, userId, instanceId);

      res.status(201).json({
        status: 'success',
        message: 'Grupo criado com sucesso',
        group: {
          id: response.data?.id || response.data?.groupId || '',
          name: response.data?.subject || subject,
          description: response.data?.description || description,
        },
      });
    } catch (evolutionError: any) {
      console.error('Erro ao criar grupo na Evolution API:', evolutionError);
      return next(
        handleControllerError(
          evolutionError,
          'Erro ao criar grupo. Verifique se os números são válidos e se você tem permissão.'
        )
      );
    }
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao criar grupo'));
  }
};

/**
 * Atualizar imagem do grupo
 * POST /api/groups/update-picture
 */
export const updateGroupPicture = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { instanceId, groupId } = req.body;
    const file = (req as any).file;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!instanceId) {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    if (!groupId) {
      return next(createValidationError('ID do grupo é obrigatório'));
    }

    if (!file) {
      return next(createValidationError('Imagem é obrigatória'));
    }

    // Buscar e validar instância
    const instance = await getAndValidateInstance(instanceId, userId, next);
    if (!instance) return;

    // Fazer upload da imagem para MidiaService
    const fileName = file.originalname || `group-picture-${Date.now()}.${file.mimetype.split('/')[1]}`;
    const uploadResult = await uploadFileToService(file.buffer, fileName, file.mimetype);

    if (!uploadResult) {
      return next(createValidationError('Erro ao fazer upload da imagem'));
    }

    // Atualizar imagem do grupo na Evolution API
    try {
      await requestEvolutionAPI(
        'POST',
        `/group/updateGroupPicture/${encodeURIComponent(instance.instanceName)}?groupJid=${encodeURIComponent(groupId)}`,
        {
          image: uploadResult.fullUrl,
        }
      );

      // Invalidar cache e emitir evento via WebSocket
      await invalidateGroupsCacheAndEmitUpdate(instance.instanceName, userId, instanceId);

      res.status(200).json({
        status: 'success',
        message: 'Imagem do grupo atualizada com sucesso',
        imageUrl: uploadResult.fullUrl,
      });
    } catch (evolutionError: any) {
      console.error('Erro ao atualizar imagem do grupo na Evolution API:', evolutionError);
      return next(
        handleControllerError(
          evolutionError,
          'Erro ao atualizar imagem do grupo. Verifique se você é administrador do grupo.'
        )
      );
    }
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao atualizar imagem do grupo'));
  }
};

/**
 * Atualizar nome do grupo
 * POST /api/groups/update-subject
 */
export const updateGroupSubject = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { instanceId, groupId, subject } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!instanceId) {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    if (!groupId) {
      return next(createValidationError('ID do grupo é obrigatório'));
    }

    if (!subject || subject.trim().length === 0) {
      return next(createValidationError('Nome do grupo é obrigatório'));
    }

    // Buscar e validar instância
    const instance = await getAndValidateInstance(instanceId, userId, next);
    if (!instance) return;

    // Atualizar nome do grupo na Evolution API
    try {
      await requestEvolutionAPI(
        'POST',
        `/group/updateGroupSubject/${encodeURIComponent(instance.instanceName)}?groupJid=${encodeURIComponent(groupId)}`,
        {
          subject: subject.trim(),
        }
      );

      // Invalidar cache e emitir evento via WebSocket
      await invalidateGroupsCacheAndEmitUpdate(instance.instanceName, userId, instanceId);

      res.status(200).json({
        status: 'success',
        message: 'Nome do grupo atualizado com sucesso',
      });
    } catch (evolutionError: any) {
      console.error('Erro ao atualizar nome do grupo na Evolution API:', evolutionError);
      return next(
        handleControllerError(
          evolutionError,
          'Erro ao atualizar nome do grupo. Verifique se você é administrador do grupo.'
        )
      );
    }
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao atualizar nome do grupo'));
  }
};

/**
 * Atualizar descrição do grupo
 * POST /api/groups/update-description
 */
export const updateGroupDescription = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { instanceId, groupId, description } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!instanceId) {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    if (!groupId) {
      return next(createValidationError('ID do grupo é obrigatório'));
    }

    // Buscar e validar instância
    const instance = await getAndValidateInstance(instanceId, userId, next);
    if (!instance) return;

    // Atualizar descrição do grupo na Evolution API
    try {
      await requestEvolutionAPI(
        'POST',
        `/group/updateGroupDescription/${encodeURIComponent(instance.instanceName)}?groupJid=${encodeURIComponent(groupId)}`,
        {
          description: description?.trim() || '',
        }
      );

      // Invalidar cache e emitir evento via WebSocket
      await invalidateGroupsCacheAndEmitUpdate(instance.instanceName, userId, instanceId);

      res.status(200).json({
        status: 'success',
        message: 'Descrição do grupo atualizada com sucesso',
      });
    } catch (evolutionError: any) {
      console.error('Erro ao atualizar descrição do grupo na Evolution API:', evolutionError);
      return next(
        handleControllerError(
          evolutionError,
          'Erro ao atualizar descrição do grupo. Verifique se você é administrador do grupo.'
        )
      );
    }
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao atualizar descrição do grupo'));
  }
};

/**
 * Obter código de convite do grupo
 * GET /api/groups/invite-code?instanceId=xxx&groupId=xxx
 */
export const getInviteCode = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { instanceId, groupId } = req.query;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!instanceId || typeof instanceId !== 'string') {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    if (!groupId || typeof groupId !== 'string') {
      return next(createValidationError('ID do grupo é obrigatório'));
    }

    // Buscar e validar instância
    const instance = await getAndValidateInstance(instanceId, userId, next);
    if (!instance) return;

    // Obter código de convite na Evolution API
    try {
      const response = await requestEvolutionAPI(
        'GET',
        `/group/inviteCode/${encodeURIComponent(instance.instanceName)}?groupJid=${encodeURIComponent(groupId)}`
      );

      res.status(200).json({
        status: 'success',
        code: response.data?.code || response.data?.inviteCode || '',
        url: response.data?.url || response.data?.inviteUrl || '',
      });
    } catch (evolutionError: any) {
      console.error('Erro ao obter código de convite na Evolution API:', evolutionError);
      return next(
        handleControllerError(
          evolutionError,
          'Erro ao obter código de convite. Verifique se você é administrador do grupo.'
        )
      );
    }
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao obter código de convite'));
  }
};

/**
 * Atualizar configurações do grupo
 * POST /api/groups/update-settings
 */
export const updateGroupSettings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { instanceId, groupId, action } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!instanceId) {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    if (!groupId) {
      return next(createValidationError('ID do grupo é obrigatório'));
    }

    if (!action) {
      return next(createValidationError('Ação é obrigatória'));
    }

    const validActions = ['announcement', 'not_announcement', 'locked', 'unlocked'];
    if (!validActions.includes(action)) {
      return next(createValidationError('Ação inválida'));
    }

    const instance = await Instance.findById(instanceId);
    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    if (instance.userId.toString() !== userId) {
      return next(createValidationError('Instância não pertence ao usuário'));
    }

    await requestEvolutionAPI(
      'POST',
      `/group/updateSetting/${encodeURIComponent(instance.instanceName)}?groupJid=${encodeURIComponent(groupId)}`,
      { action }
    );

    // Invalidar cache e emitir evento via WebSocket
    await invalidateGroupsCacheAndEmitUpdate(instance.instanceName, userId, instanceId);

    res.status(200).json({
      status: 'success',
      message: 'Configuração do grupo atualizada com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao atualizar configuração do grupo'));
  }
};

/**
 * Mencionar todos os participantes do grupo
 * POST /api/groups/mention-everyone
 */
export const mentionEveryone = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { instanceId, groupId, text } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!instanceId) {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    if (!groupId) {
      return next(createValidationError('ID do grupo é obrigatório'));
    }

    if (!text || text.trim().length === 0) {
      return next(createValidationError('Texto da mensagem é obrigatório'));
    }

    // Buscar e validar instância
    const instance = await getAndValidateInstance(instanceId, userId, next);
    if (!instance) return;

    // Enviar mensagem mencionando todos via Evolution API
    try {
      await requestEvolutionAPI(
        'POST',
        `/message/sendText/${encodeURIComponent(instance.instanceName)}`,
        {
          number: groupId,
          text: text.trim(),
          mentionsEveryOne: true,
        }
      );

      res.status(200).json({
        status: 'success',
        message: 'Mensagem enviada com sucesso',
      });
    } catch (evolutionError: any) {
      console.error('Erro ao mencionar todos na Evolution API:', evolutionError);
      return next(
        handleControllerError(
          evolutionError,
          'Erro ao enviar mensagem. Verifique se você tem permissão no grupo.'
        )
      );
    }
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao mencionar todos os participantes'));
  }
};

