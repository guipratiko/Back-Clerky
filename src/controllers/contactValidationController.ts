import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  createValidationError,
  handleControllerError,
} from '../utils/errorHelpers';
import { validateContacts } from '../services/contactValidationService';
import Instance from '../models/Instance';

/**
 * Validar números de telefone
 * POST /api/dispatches/validate-contacts
 */
export const validateContactsNumbers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const { instanceId, contacts } = req.body;

    if (!instanceId) {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return next(createValidationError('Lista de contatos é obrigatória'));
    }

    // Buscar instância
    const instance = await Instance.findById(instanceId);
    if (!instance) {
      return next(createValidationError('Instância não encontrada'));
    }

    // Validar contatos
    const validatedContacts = await validateContacts(instance.instanceName, contacts);

    res.status(200).json({
      status: 'success',
      contacts: validatedContacts.map((c) => ({
        phone: c.phone,
        name: c.name,
        validated: c.validated,
        validationResult: c.validationResult
          ? {
              exists: c.validationResult.exists,
              name: c.validationResult.name,
            }
          : null,
      })),
      stats: {
        total: validatedContacts.length,
        valid: validatedContacts.filter((c) => c.validated).length,
        invalid: validatedContacts.filter((c) => !c.validated).length,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao validar contatos'));
  }
};

