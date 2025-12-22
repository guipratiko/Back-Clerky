import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createValidationError, createNotFoundError, handleControllerError } from '../utils/errorHelpers';
import { LabelService } from '../services/labelService';

/**
 * Obter todas as labels do usuário
 */
export const getLabels = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    // Garantir que as labels existem (inicializar se necessário)
    await LabelService.initializeLabels(userId);

    const labels = await LabelService.getLabelsByUserId(userId);

    res.status(200).json({
      status: 'success',
      labels: labels.map((label) => ({
        id: label.id,
        shortId: label.shortId,
        name: label.name,
        color: label.color,
        order: label.orderIndex,
      })),
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao listar labels'));
  }
};

/**
 * Atualizar label (nome e/ou cor)
 */
export const updateLabel = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { name, color } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!name && !color) {
      return next(createValidationError('Nome ou cor devem ser fornecidos'));
    }

    if (name && name.trim().length === 0) {
      return next(createValidationError('Nome da label não pode estar vazio'));
    }

    if (name && name.length > 50) {
      return next(createValidationError('Nome da label deve ter no máximo 50 caracteres'));
    }

    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return next(createValidationError('Cor deve ser um código hexadecimal válido (ex: #FF5733)'));
    }

    const label = await LabelService.updateLabel(id, userId, { name, color });

    if (!label) {
      return next(createNotFoundError('Label não encontrada'));
    }

    res.status(200).json({
      status: 'success',
      label: {
        id: label.id,
        shortId: label.shortId,
        name: label.name,
        color: label.color,
        order: label.orderIndex,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Label não encontrada') {
      return next(createNotFoundError('Label não encontrada'));
    }
    return next(handleControllerError(error, 'Erro ao atualizar label'));
  }
};

/**
 * Adicionar label a um contato
 */
export const addLabelToContact = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { contactId } = req.params;
    const { labelId } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!labelId) {
      return next(createValidationError('ID da label é obrigatório'));
    }

    // Verificar se a label pertence ao usuário
    const label = await LabelService.getLabelById(labelId, userId);
    if (!label) {
      return next(createNotFoundError('Label não encontrada'));
    }

    // Verificar se o contato existe e pertence ao usuário
    const { ContactService } = await import('../services/contactService');
    const contact = await ContactService.getContactById(contactId, userId);
    if (!contact) {
      return next(createNotFoundError('Contato não encontrado'));
    }

    await LabelService.addLabelToContact(contactId, labelId);

    res.status(200).json({
      status: 'success',
      message: 'Label adicionada ao contato com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao adicionar label ao contato'));
  }
};

/**
 * Remover label de um contato
 */
export const removeLabelFromContact = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { contactId, labelId } = req.params;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    // Verificar se a label pertence ao usuário
    const label = await LabelService.getLabelById(labelId, userId);
    if (!label) {
      return next(createNotFoundError('Label não encontrada'));
    }

    // Verificar se o contato existe e pertence ao usuário
    const { ContactService } = await import('../services/contactService');
    const contact = await ContactService.getContactById(contactId, userId);
    if (!contact) {
      return next(createNotFoundError('Contato não encontrado'));
    }

    await LabelService.removeLabelFromContact(contactId, labelId);

    res.status(200).json({
      status: 'success',
      message: 'Label removida do contato com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao remover label do contato'));
  }
};

