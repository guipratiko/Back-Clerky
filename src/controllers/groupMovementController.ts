/**
 * Controller para gerenciar movimentações de grupos e mensagens automáticas
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { GroupMovementService } from '../services/groupMovementService';
import { GroupAutoMessageService } from '../services/groupAutoMessageService';
import {
  createValidationError,
  createNotFoundError,
  handleControllerError,
} from '../utils/errorHelpers';

/**
 * Obter histórico de movimentações de grupos
 * GET /api/groups/movements?instanceId=xxx&groupId=xxx&movementType=join&startDate=xxx&endDate=xxx&page=1&limit=50
 */
export const getGroupMovements = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const {
      instanceId,
      groupId,
      participantId,
      movementType,
      startDate,
      endDate,
      page = '1',
      limit = '50',
    } = req.query;

    // Validar e converter tipos
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 50;

    if (pageNum < 1) {
      return next(createValidationError('Página deve ser maior que 0'));
    }

    if (limitNum < 1 || limitNum > 100) {
      return next(createValidationError('Limite deve estar entre 1 e 100'));
    }

    // Validar movementType se fornecido
    if (movementType && !['join', 'leave', 'promote', 'demote'].includes(movementType as string)) {
      return next(createValidationError('Tipo de movimentação inválido'));
    }

    // Converter datas se fornecidas
    let startDateObj: Date | undefined;
    let endDateObj: Date | undefined;

    if (startDate) {
      startDateObj = new Date(startDate as string);
      if (isNaN(startDateObj.getTime())) {
        return next(createValidationError('Data inicial inválida'));
      }
    }

    if (endDate) {
      endDateObj = new Date(endDate as string);
      if (isNaN(endDateObj.getTime())) {
        return next(createValidationError('Data final inválida'));
      }
    }

    const result = await GroupMovementService.getMovements({
      userId,
      instanceId: instanceId as string | undefined,
      groupId: groupId as string | undefined,
      participantId: participantId as string | undefined,
      movementType: movementType as 'join' | 'leave' | 'promote' | 'demote' | undefined,
      startDate: startDateObj,
      endDate: endDateObj,
      page: pageNum,
      limit: limitNum,
    });

    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao buscar movimentações de grupos'));
  }
};

/**
 * Obter estatísticas de movimentações
 * GET /api/groups/movements/statistics?instanceId=xxx&groupId=xxx&startDate=xxx&endDate=xxx
 */
export const getGroupMovementsStatistics = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const { instanceId, groupId, startDate, endDate } = req.query;

    // Converter datas se fornecidas
    let startDateObj: Date | undefined;
    let endDateObj: Date | undefined;

    if (startDate) {
      startDateObj = new Date(startDate as string);
      if (isNaN(startDateObj.getTime())) {
        return next(createValidationError('Data inicial inválida'));
      }
    }

    if (endDate) {
      endDateObj = new Date(endDate as string);
      if (isNaN(endDateObj.getTime())) {
        return next(createValidationError('Data final inválida'));
      }
    }

    const statistics = await GroupMovementService.getStatistics(
      userId,
      instanceId as string | undefined,
      groupId as string | undefined,
      startDateObj,
      endDateObj
    );

    res.status(200).json({
      status: 'success',
      data: statistics,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao buscar estatísticas de movimentações'));
  }
};

/**
 * Criar ou atualizar mensagem automática de grupo
 * POST /api/groups/auto-messages
 */
export const upsertGroupAutoMessage = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const { instanceId, groupId, messageType, messageText, isActive, delaySeconds } = req.body;

    if (!instanceId) {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    if (!messageType || !['welcome', 'goodbye'].includes(messageType)) {
      return next(createValidationError('Tipo de mensagem deve ser "welcome" ou "goodbye"'));
    }

    if (!messageText || messageText.trim().length === 0) {
      return next(createValidationError('Texto da mensagem é obrigatório'));
    }

    // Validar delay (deve ser número não negativo)
    const delay = delaySeconds !== undefined ? parseInt(String(delaySeconds), 10) : 0;
    if (isNaN(delay) || delay < 0) {
      return next(createValidationError('Delay deve ser um número não negativo'));
    }

    const autoMessage = await GroupAutoMessageService.upsertAutoMessage({
      userId,
      instanceId,
      groupId: groupId || null, // NULL = aplicar a todos os grupos
      messageType,
      messageText: messageText.trim(),
      isActive: isActive !== undefined ? isActive : true,
      delaySeconds: delay,
    });

    res.status(200).json({
      status: 'success',
      message: 'Mensagem automática configurada com sucesso',
      data: autoMessage,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao configurar mensagem automática'));
  }
};

/**
 * Obter mensagens automáticas de uma instância
 * GET /api/groups/auto-messages?instanceId=xxx
 */
export const getGroupAutoMessages = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const { instanceId } = req.query;

    if (!instanceId) {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    const autoMessages = await GroupAutoMessageService.getAutoMessagesByInstance(
      userId,
      instanceId as string
    );

    res.status(200).json({
      status: 'success',
      data: autoMessages,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao buscar mensagens automáticas'));
  }
};

/**
 * Atualizar mensagem automática
 * PUT /api/groups/auto-messages/:id
 */
export const updateGroupAutoMessage = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const { id } = req.params;
    const { messageText, isActive, delaySeconds } = req.body;

    if (!id) {
      return next(createValidationError('ID da mensagem automática é obrigatório'));
    }

    const updates: any = {};
    if (messageText !== undefined) {
      if (messageText.trim().length === 0) {
        return next(createValidationError('Texto da mensagem não pode ser vazio'));
      }
      updates.messageText = messageText.trim();
    }

    if (isActive !== undefined) {
      updates.isActive = isActive;
    }

    if (delaySeconds !== undefined) {
      const delay = parseInt(String(delaySeconds), 10);
      if (isNaN(delay) || delay < 0) {
        return next(createValidationError('Delay deve ser um número não negativo'));
      }
      updates.delaySeconds = delay;
    }

    if (Object.keys(updates).length === 0) {
      return next(createValidationError('Nenhum campo para atualizar'));
    }

    const autoMessage = await GroupAutoMessageService.updateAutoMessage(id, userId, updates);

    res.status(200).json({
      status: 'success',
      message: 'Mensagem automática atualizada com sucesso',
      data: autoMessage,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Mensagem automática não encontrada') {
      return next(createNotFoundError('Mensagem automática'));
    }
    return next(handleControllerError(error, 'Erro ao atualizar mensagem automática'));
  }
};

/**
 * Deletar mensagem automática
 * DELETE /api/groups/auto-messages/:id
 */
export const deleteGroupAutoMessage = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const { id } = req.params;

    if (!id) {
      return next(createValidationError('ID da mensagem automática é obrigatório'));
    }

    await GroupAutoMessageService.deleteAutoMessage(id, userId);

    res.status(200).json({
      status: 'success',
      message: 'Mensagem automática deletada com sucesso',
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Mensagem automática não encontrada') {
      return next(createNotFoundError('Mensagem automática'));
    }
    return next(handleControllerError(error, 'Erro ao deletar mensagem automática'));
  }
};

/**
 * Substituir mensagens automáticas de grupos específicos pelas mensagens globais
 * POST /api/groups/auto-messages/replace-groups
 */
export const replaceGroupAutoMessages = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const { instanceId } = req.body;

    if (!instanceId) {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    const result = await GroupAutoMessageService.replaceGroupAutoMessages(userId, instanceId);

    res.status(200).json({
      status: 'success',
      message: `${result.replaced} mensagem(ns) automática(s) substituída(s) com sucesso`,
      data: result,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao substituir mensagens automáticas'));
  }
};
