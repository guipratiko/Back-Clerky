/**
 * Controller para gerenciar Grupos do WhatsApp
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import Instance from '../models/Instance';
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
  settings?: {
    announcement?: boolean; // true = only admins, false = all members
    locked?: boolean; // true = only admins edit, false = all members edit
  };
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

    // Buscar instância no banco
    const instance = await Instance.findById(instanceId);

    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    // Verificar se a instância pertence ao usuário
    if (instance.userId.toString() !== userId) {
      return next(createValidationError('Instância não pertence ao usuário'));
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
        settings: {
          // Usar valores explícitos da API, não defaults
          announcement: group.announcement !== undefined ? Boolean(group.announcement) : (group.settings?.announcement !== undefined ? Boolean(group.settings.announcement) : false),
          locked: group.locked !== undefined ? Boolean(group.locked) : (group.settings?.locked !== undefined ? Boolean(group.settings.locked) : false),
        },
      }));

      res.status(200).json({
        status: 'success',
        groups,
        count: groups.length,
      });
    } catch (evolutionError: any) {
      console.error('Erro ao buscar grupos na Evolution API:', evolutionError);
      // Se a Evolution API retornar erro, retornar array vazio
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

    // Buscar instância no banco
    const instance = await Instance.findById(instanceId);

    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    // Verificar se a instância pertence ao usuário
    if (instance.userId.toString() !== userId) {
      return next(createValidationError('Instância não pertence ao usuário'));
    }

    // Sair do grupo na Evolution API
    try {
      await requestEvolutionAPI(
        'DELETE',
        `/group/leaveGroup/${encodeURIComponent(instance.instanceName)}`,
        {
          groupJid: groupId,
        }
      );

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

    // Buscar instância
    const instance = await Instance.findById(instanceId);
    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    if (instance.userId.toString() !== userId) {
      return next(createValidationError('Instância não pertence ao usuário'));
    }

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

    // Buscar instância
    const instance = await Instance.findById(instanceId);
    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    if (instance.userId.toString() !== userId) {
      return next(createValidationError('Instância não pertence ao usuário'));
    }

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

    // Buscar instância
    const instance = await Instance.findById(instanceId);
    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    if (instance.userId.toString() !== userId) {
      return next(createValidationError('Instância não pertence ao usuário'));
    }

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

    // Buscar instância
    const instance = await Instance.findById(instanceId);
    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    if (instance.userId.toString() !== userId) {
      return next(createValidationError('Instância não pertence ao usuário'));
    }

    // Atualizar nome do grupo na Evolution API
    try {
      await requestEvolutionAPI(
        'POST',
        `/group/updateGroupSubject/${encodeURIComponent(instance.instanceName)}?groupJid=${encodeURIComponent(groupId)}`,
        {
          subject: subject.trim(),
        }
      );

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

    // Buscar instância
    const instance = await Instance.findById(instanceId);
    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    if (instance.userId.toString() !== userId) {
      return next(createValidationError('Instância não pertence ao usuário'));
    }

    // Atualizar descrição do grupo na Evolution API
    try {
      await requestEvolutionAPI(
        'POST',
        `/group/updateGroupDescription/${encodeURIComponent(instance.instanceName)}?groupJid=${encodeURIComponent(groupId)}`,
        {
          description: description?.trim() || '',
        }
      );

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

    // Buscar instância
    const instance = await Instance.findById(instanceId);
    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    if (instance.userId.toString() !== userId) {
      return next(createValidationError('Instância não pertence ao usuário'));
    }

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
    const { instanceId, groupId, announcement, locked } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!instanceId) {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    if (!groupId) {
      return next(createValidationError('ID do grupo é obrigatório'));
    }

    if (announcement === undefined && locked === undefined) {
      return next(createValidationError('Pelo menos uma configuração deve ser fornecida'));
    }

    // Buscar instância
    const instance = await Instance.findById(instanceId);
    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    if (instance.userId.toString() !== userId) {
      return next(createValidationError('Instância não pertence ao usuário'));
    }

    // Normalizar valores booleanos (garantir que são true/false, não undefined)
    const announcementValue = announcement === undefined ? undefined : Boolean(announcement);
    const lockedValue = locked === undefined ? undefined : Boolean(locked);

    // Atualizar configurações na Evolution API
    // A API aceita apenas uma ação por vez, então precisamos fazer duas chamadas se necessário
    const results: Array<{ setting: string; success: boolean; error?: string }> = [];

    // Atualizar announcement apenas se foi fornecido explicitamente
    if (announcementValue !== undefined) {
      try {
        const action = announcementValue ? 'announcement' : 'not_announcement';
        await requestEvolutionAPI(
          'POST',
          `/group/updateSetting/${encodeURIComponent(instance.instanceName)}?groupJid=${encodeURIComponent(groupId)}`,
          {
            action,
          }
        );
        results.push({ setting: 'announcement', success: true });
      } catch (error: any) {
        console.error('Erro ao atualizar announcement:', error);
        results.push({ setting: 'announcement', success: false, error: error.message });
      }
    }

    // Atualizar locked apenas se foi fornecido explicitamente
    if (lockedValue !== undefined) {
      try {
        const action = lockedValue ? 'locked' : 'unlocked';
        await requestEvolutionAPI(
          'POST',
          `/group/updateSetting/${encodeURIComponent(instance.instanceName)}?groupJid=${encodeURIComponent(groupId)}`,
          {
            action,
          }
        );
        results.push({ setting: 'locked', success: true });
      } catch (error: any) {
        console.error('Erro ao atualizar locked:', error);
        results.push({ setting: 'locked', success: false, error: error.message });
      }
    }

    const hasErrors = results.some((r) => !r.success);
    if (hasErrors) {
      const errorMessages = results.filter((r) => !r.success).map((r) => r.error).join(', ');
      return next(
        handleControllerError(
          new Error(errorMessages),
          'Erro ao atualizar algumas configurações do grupo. Verifique se você é administrador do grupo.'
        )
      );
    }

    res.status(200).json({
      status: 'success',
      message: 'Configurações do grupo atualizadas com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao atualizar configurações do grupo'));
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

    // Buscar instância
    const instance = await Instance.findById(instanceId);
    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    if (instance.userId.toString() !== userId) {
      return next(createValidationError('Instância não pertence ao usuário'));
    }

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

