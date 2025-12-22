import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createValidationError, createNotFoundError, handleControllerError } from '../utils/errorHelpers';
import { CRMColumnService } from '../services/crmColumnService';
import { ContactService } from '../services/contactService';
import { LabelService } from '../services/labelService';
import { mapContactsToApiFormat } from '../utils/contactMappers';

/**
 * Obter todas as colunas do usuário
 */
export const getColumns = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const columns = await CRMColumnService.getColumnsByUserId(userId);

    res.status(200).json({
      status: 'success',
      columns: columns.map((col) => ({
        id: col.id,
        shortId: col.shortId,
        name: col.name,
        order: col.orderIndex,
        color: col.color || null,
      })),
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao listar colunas'));
  }
};

/**
 * Atualizar nome de uma coluna
 */
export const updateColumn = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { name } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!name || name.trim().length === 0) {
      return next(createValidationError('Nome da coluna é obrigatório'));
    }

    const column = await CRMColumnService.getColumnById(id, userId);

    if (!column) {
      return next(createNotFoundError('Coluna'));
    }

    const updatedColumn = await CRMColumnService.updateColumn(id, userId, {
      name: name.trim(),
    });

    res.status(200).json({
      status: 'success',
      column: {
        id: updatedColumn.id,
        name: updatedColumn.name,
        order: updatedColumn.orderIndex,
        color: updatedColumn.color || null,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao atualizar coluna'));
  }
};

/**
 * Obter todos os contatos com contagem de mensagens não lidas
 */
export const getContacts = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    // Garantir que as colunas existem
    await CRMColumnService.initializeColumns(userId);
    // Garantir que as labels existem
    await LabelService.initializeLabels(userId);

    const contacts = await ContactService.getContactsByUserId(userId);
    const columns = await CRMColumnService.getColumnsByUserId(userId);

    // Buscar labels para cada contato
    const contactsWithLabels = await Promise.all(
      contacts.map(async (contact) => {
        const labels = await LabelService.getLabelsByContactId(contact.id);
        return {
          ...contact,
          labels: labels.map((label) => ({
            id: label.id,
            name: label.name,
            color: label.color,
            order: label.orderIndex,
          })),
        };
      })
    );

    res.status(200).json({
      status: 'success',
      count: contactsWithLabels.length,
      contacts: mapContactsToApiFormat(contactsWithLabels, columns),
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao listar contatos'));
  }
};

/**
 * Mover contato para outra coluna
 */
export const moveContact = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { columnId } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!columnId) {
      return next(createValidationError('ID da coluna é obrigatório'));
    }

    // Verificar se a coluna pertence ao usuário
    const column = await CRMColumnService.getColumnById(columnId, userId);
    if (!column) {
      return next(createNotFoundError('Coluna'));
    }

    // Verificar se o contato existe
    const contact = await ContactService.getContactById(id, userId);
    if (!contact) {
      return next(createNotFoundError('Contato'));
    }

    // Mover contato
    const updatedContact = await ContactService.moveContact(id, userId, columnId);

    res.status(200).json({
      status: 'success',
      message: 'Contato movido com sucesso',
      contact: {
        id: updatedContact.id,
        columnId: updatedContact.columnId,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao mover contato'));
  }
};

/**
 * Buscar contatos
 */
export const searchContacts = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { q } = req.query; // Query string de busca

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!q || typeof q !== 'string') {
      return getContacts(req, res, next);
    }

    const contacts = await ContactService.searchContacts({
      userId,
      query: q,
    });

    const columns = await CRMColumnService.getColumnsByUserId(userId);

    // Buscar labels para cada contato
    const contactsWithLabels = await Promise.all(
      contacts.map(async (contact) => {
        const labels = await LabelService.getLabelsByContactId(contact.id);
        return {
          ...contact,
          labels: labels.map((label) => ({
            id: label.id,
            name: label.name,
            color: label.color,
            order: label.orderIndex,
          })),
        };
      })
    );

    res.status(200).json({
      status: 'success',
      count: contactsWithLabels.length,
      contacts: mapContactsToApiFormat(contactsWithLabels, columns),
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao buscar contatos'));
  }
};
