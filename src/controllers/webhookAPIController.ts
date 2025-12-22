import { Response, NextFunction } from 'express';
import { InstanceAuthRequest } from '../middleware/instanceAuth';
import { createValidationError, createNotFoundError, handleControllerError } from '../utils/errorHelpers';
import { requestEvolutionAPI } from '../utils/evolutionAPI';
import { MessageService } from '../services/messageService';
import { CRMColumnService } from '../services/crmColumnService';
import { ContactService } from '../services/contactService';
import { LabelService } from '../services/labelService';
import { detectMediaType } from '../utils/mediaService';
import { mapContactsToApiFormat } from '../utils/contactMappers';
import {
  phoneToRemoteJid,
  extractMessageId,
  getAndValidateInstance,
  getOrCreateContactAndColumn,
  emitContactUpdated,
  handleWebhookAPIError,
} from '../utils/webhookAPIHelpers';

/**
 * POST /api/v1/webhook/send-text
 * Enviar mensagem de texto
 */
export const sendText = async (
  req: InstanceAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { phone, text } = req.body;

    if (!phone) {
      return next(createValidationError('Campo "phone" é obrigatório'));
    }
    if (!text || text.trim().length === 0) {
      return next(createValidationError('Campo "text" é obrigatório'));
    }

    const instance = await getAndValidateInstance(req.instance!._id);
    const remoteJid = phoneToRemoteJid(phone);

    // Enviar mensagem via Evolution API
    const evolutionResponse = await requestEvolutionAPI(
      'POST',
      `/message/sendText/${encodeURIComponent(instance.instanceName)}`,
      {
        number: remoteJid,
        text: text.trim(),
      }
    );

    const sentMessageId = extractMessageId(evolutionResponse);
    const { contact } = await getOrCreateContactAndColumn(
      req.instance!.userId,
      req.instance!._id,
      remoteJid,
      phone
    );

    // Criar registro da mensagem no PostgreSQL
    const now = new Date();
    const message = await MessageService.createMessage({
      userId: req.instance!.userId,
      instanceId: req.instance!._id,
      contactId: contact.id,
      remoteJid,
      messageId: sentMessageId,
      fromMe: true,
      messageType: 'conversation',
      content: text.trim(),
      timestamp: now,
      read: true,
    });

    // Emitir evento WebSocket para atualizar frontend em tempo real
    await emitContactUpdated(req.instance!.userId, req.instance!._id);

    res.status(200).json({
      status: 'success',
      message: 'Mensagem enviada com sucesso',
      data: {
        messageId: message.messageId,
        contactId: contact.id,
        timestamp: message.timestamp,
      },
    });
  } catch (error: unknown) {
    return handleWebhookAPIError(error, 'Erro ao enviar mensagem de texto', next);
  }
};

/**
 * POST /api/v1/webhook/send-image
 * Enviar imagem (com ou sem legenda)
 */
export const sendImage = async (
  req: InstanceAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { phone, image, caption } = req.body;

    if (!phone) {
      return next(createValidationError('Campo "phone" é obrigatório'));
    }
    if (!image) {
      return next(createValidationError('Campo "image" é obrigatório (URL pública)'));
    }

    const instance = await getAndValidateInstance(req.instance!._id);
    const remoteJid = phoneToRemoteJid(phone);

    // Enviar imagem via Evolution API
    const evolutionResponse = await requestEvolutionAPI(
      'POST',
      `/message/sendMedia/${encodeURIComponent(instance.instanceName)}`,
      {
        number: remoteJid,
        mediatype: 'image',
        mimetype: 'image/jpeg',
        caption: caption || '',
        media: image, // URL pública
        fileName: `image-${Date.now()}.jpg`,
      }
    );

    const sentMessageId = extractMessageId(evolutionResponse);
    const { contact } = await getOrCreateContactAndColumn(
      req.instance!.userId,
      req.instance!._id,
      remoteJid,
      phone
    );

    // Criar registro da mensagem no PostgreSQL
    const now = new Date();
    const message = await MessageService.createMessage({
      userId: req.instance!.userId,
      instanceId: req.instance!._id,
      contactId: contact.id,
      remoteJid,
      messageId: sentMessageId,
      fromMe: true,
      messageType: 'imageMessage',
      content: '[Mídia]',
      mediaUrl: image,
      timestamp: now,
      read: true,
    });

    // Emitir evento WebSocket para atualizar frontend em tempo real
    await emitContactUpdated(req.instance!.userId, req.instance!._id);

    res.status(200).json({
      status: 'success',
      message: 'Imagem enviada com sucesso',
      data: {
        messageId: message.messageId,
        contactId: contact.id,
        timestamp: message.timestamp,
      },
    });
  } catch (error: unknown) {
    return handleWebhookAPIError(error, 'Erro ao enviar imagem', next);
  }
};

/**
 * POST /api/v1/webhook/send-video
 * Enviar vídeo (com ou sem legenda)
 */
export const sendVideo = async (
  req: InstanceAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { phone, video, caption } = req.body;

    if (!phone) {
      return next(createValidationError('Campo "phone" é obrigatório'));
    }
    if (!video) {
      return next(createValidationError('Campo "video" é obrigatório (URL pública)'));
    }

    const instance = await getAndValidateInstance(req.instance!._id);
    const remoteJid = phoneToRemoteJid(phone);

    // Enviar vídeo via Evolution API
    const evolutionResponse = await requestEvolutionAPI(
      'POST',
      `/message/sendMedia/${encodeURIComponent(instance.instanceName)}`,
      {
        number: remoteJid,
        mediatype: 'video',
        mimetype: 'video/mp4',
        caption: caption || '',
        media: video, // URL pública
        fileName: `video-${Date.now()}.mp4`,
      }
    );

    const sentMessageId = extractMessageId(evolutionResponse);
    const { contact } = await getOrCreateContactAndColumn(
      req.instance!.userId,
      req.instance!._id,
      remoteJid,
      phone
    );

    // Criar registro da mensagem no PostgreSQL
    const now = new Date();
    const message = await MessageService.createMessage({
      userId: req.instance!.userId,
      instanceId: req.instance!._id,
      contactId: contact.id,
      remoteJid,
      messageId: sentMessageId,
      fromMe: true,
      messageType: 'videoMessage',
      content: '[Mídia]',
      mediaUrl: video,
      timestamp: now,
      read: true,
    });

    // Emitir evento WebSocket para atualizar frontend em tempo real
    await emitContactUpdated(req.instance!.userId, req.instance!._id);

    res.status(200).json({
      status: 'success',
      message: 'Vídeo enviado com sucesso',
      data: {
        messageId: message.messageId,
        contactId: contact.id,
        timestamp: message.timestamp,
      },
    });
  } catch (error: unknown) {
    return handleWebhookAPIError(error, 'Erro ao enviar vídeo', next);
  }
};

/**
 * POST /api/v1/webhook/send-file
 * Enviar arquivo genérico
 */
export const sendFile = async (
  req: InstanceAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { phone, file, filename, mimetype } = req.body;

    if (!phone) {
      return next(createValidationError('Campo "phone" é obrigatório'));
    }
    if (!file) {
      return next(createValidationError('Campo "file" é obrigatório (URL pública)'));
    }
    if (!filename) {
      return next(createValidationError('Campo "filename" é obrigatório'));
    }

    const instance = await getAndValidateInstance(req.instance!._id);
    const remoteJid = phoneToRemoteJid(phone);

    // Detectar tipo de mídia
    const fileMimeType = mimetype || 'application/octet-stream';
    const { mediatype, messageType } = detectMediaType(fileMimeType);

    // Enviar arquivo via Evolution API
    const evolutionResponse = await requestEvolutionAPI(
      'POST',
      `/message/sendMedia/${encodeURIComponent(instance.instanceName)}`,
      {
        number: remoteJid,
        mediatype,
        mimetype: fileMimeType,
        media: file, // URL pública
        fileName: filename,
      }
    );

    const sentMessageId = extractMessageId(evolutionResponse);
    const { contact } = await getOrCreateContactAndColumn(
      req.instance!.userId,
      req.instance!._id,
      remoteJid,
      phone
    );

    // Criar registro da mensagem no PostgreSQL
    const now = new Date();
    const message = await MessageService.createMessage({
      userId: req.instance!.userId,
      instanceId: req.instance!._id,
      contactId: contact.id,
      remoteJid,
      messageId: sentMessageId,
      fromMe: true,
      messageType: messageType || 'documentMessage',
      content: '[Mídia]',
      mediaUrl: file,
      timestamp: now,
      read: true,
    });

    // Emitir evento WebSocket para atualizar frontend em tempo real
    await emitContactUpdated(req.instance!.userId, req.instance!._id);

    res.status(200).json({
      status: 'success',
      message: 'Arquivo enviado com sucesso',
      data: {
        messageId: message.messageId,
        contactId: contact.id,
        timestamp: message.timestamp,
      },
    });
  } catch (error: unknown) {
    return handleWebhookAPIError(error, 'Erro ao enviar arquivo', next);
  }
};

/**
 * POST /api/v1/webhook/send-audio
 * Enviar áudio
 */
export const sendAudio = async (
  req: InstanceAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { phone, audio } = req.body;

    if (!phone) {
      return next(createValidationError('Campo "phone" é obrigatório'));
    }
    if (!audio) {
      return next(createValidationError('Campo "audio" é obrigatório (URL pública)'));
    }

    const instance = await getAndValidateInstance(req.instance!._id);
    const remoteJid = phoneToRemoteJid(phone);

    // Enviar áudio via Evolution API
    const evolutionResponse = await requestEvolutionAPI(
      'POST',
      `/message/sendWhatsAppAudio/${encodeURIComponent(instance.instanceName)}`,
      {
        number: remoteJid,
        audio: audio, // URL pública
      }
    );

    const sentMessageId = extractMessageId(evolutionResponse);
    const { contact } = await getOrCreateContactAndColumn(
      req.instance!.userId,
      req.instance!._id,
      remoteJid,
      phone
    );

    // Criar registro da mensagem no PostgreSQL
    const now = new Date();
    const message = await MessageService.createMessage({
      userId: req.instance!.userId,
      instanceId: req.instance!._id,
      contactId: contact.id,
      remoteJid,
      messageId: sentMessageId,
      fromMe: true,
      messageType: 'audioMessage',
      content: '[Mídia]',
      mediaUrl: audio,
      timestamp: now,
      read: true,
    });

    // Emitir evento WebSocket para atualizar frontend em tempo real
    await emitContactUpdated(req.instance!.userId, req.instance!._id);

    res.status(200).json({
      status: 'success',
      message: 'Áudio enviado com sucesso',
      data: {
        messageId: message.messageId,
        contactId: contact.id,
        timestamp: message.timestamp,
      },
    });
  } catch (error: unknown) {
    return handleWebhookAPIError(error, 'Erro ao enviar áudio', next);
  }
};

/**
 * POST /api/v1/webhook/move-contact
 * Mover contato entre colunas
 */
export const moveContact = async (
  req: InstanceAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { phone, columnId } = req.body;

    if (!phone) {
      return next(createValidationError('Campo "phone" é obrigatório'));
    }
    if (!columnId) {
      return next(createValidationError('Campo "columnId" é obrigatório'));
    }

    const remoteJid = phoneToRemoteJid(phone);

    // Buscar contato
    const contact = await ContactService.getContactByRemoteJid(
      req.instance!.userId,
      req.instance!._id,
      remoteJid
    );

    if (!contact) {
      return next(createNotFoundError('Contato'));
    }

    // Verificar se a coluna pertence ao usuário
    const column = await CRMColumnService.getColumnById(columnId, req.instance!.userId);
    if (!column) {
      return next(createNotFoundError('Coluna'));
    }

    // Mover contato
    const updatedContact = await ContactService.moveContact(
      contact.id,
      req.instance!.userId,
      columnId
    );

    // Emitir evento WebSocket para atualizar frontend em tempo real
    await emitContactUpdated(req.instance!.userId, req.instance!._id);

    res.status(200).json({
      status: 'success',
      message: 'Contato movido com sucesso',
      data: {
        contactId: updatedContact.id,
        columnId: updatedContact.columnId,
        columnName: column.name,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao mover contato'));
  }
};

/**
 * GET /api/v1/webhook/contacts
 * Listar contatos
 */
export const getContacts = async (
  req: InstanceAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const contacts = await ContactService.getContactsByUserId(
      req.instance!.userId,
      req.instance!._id
    );
    const columns = await CRMColumnService.getColumnsByUserId(req.instance!.userId);

    res.status(200).json({
      status: 'success',
      count: contacts.length,
      contacts: mapContactsToApiFormat(contacts, columns),
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao listar contatos'));
  }
};

/**
 * GET /api/v1/webhook/columns
 * Listar colunas do Kanban
 */
export const getColumns = async (
  req: InstanceAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const columns = await CRMColumnService.getColumnsByUserId(req.instance!.userId);

    res.status(200).json({
      status: 'success',
      columns: columns.map((col) => ({
        id: col.id,
        shortId: col.shortId,
        name: col.name,
        order: col.orderIndex,
        color: col.color,
      })),
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao listar colunas'));
  }
};

/**
 * GET /api/v1/webhook/labels
 * Listar todas as labels (etiquetas) disponíveis
 */
export const getLabels = async (
  req: InstanceAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Garantir que as labels existem (inicializar se necessário)
    await LabelService.initializeLabels(req.instance!.userId);

    const labels = await LabelService.getLabelsByUserId(req.instance!.userId);

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
 * POST /api/v1/webhook/add-label
 * Adicionar label a um contato
 */
export const addLabelToContact = async (
  req: InstanceAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { phone, labelId } = req.body;

    if (!phone) {
      return next(createValidationError('Campo "phone" é obrigatório'));
    }
    if (!labelId) {
      return next(createValidationError('Campo "labelId" é obrigatório'));
    }

    // Verificar se a label pertence ao usuário
    const label = await LabelService.getLabelById(labelId, req.instance!.userId);
    if (!label) {
      return next(createNotFoundError('Label não encontrada'));
    }

    // Buscar ou criar contato
    const instance = await getAndValidateInstance(req.instance!._id);
    const remoteJid = phoneToRemoteJid(phone);
    const { contact } = await getOrCreateContactAndColumn(
      req.instance!.userId,
      req.instance!._id,
      remoteJid,
      phone
    );

    // Adicionar label ao contato (usar UUID da label, não o labelId que pode ser short_id)
    await LabelService.addLabelToContact(contact.id, label.id);

    await emitContactUpdated(req.instance!.userId, req.instance!._id);

    res.status(200).json({
      status: 'success',
      message: 'Label adicionada ao contato com sucesso',
      data: {
        contactId: contact.id,
        labelId: label.id,
        labelName: label.name,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao adicionar label ao contato'));
  }
};

/**
 * POST /api/v1/webhook/remove-label
 * Remover label de um contato
 */
export const removeLabelFromContact = async (
  req: InstanceAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { phone, labelId } = req.body;

    if (!phone) {
      return next(createValidationError('Campo "phone" é obrigatório'));
    }
    if (!labelId) {
      return next(createValidationError('Campo "labelId" é obrigatório'));
    }

    // Verificar se a label pertence ao usuário
    const label = await LabelService.getLabelById(labelId, req.instance!.userId);
    if (!label) {
      return next(createNotFoundError('Label não encontrada'));
    }

    // Buscar contato
    const instance = await getAndValidateInstance(req.instance!._id);
    const remoteJid = phoneToRemoteJid(phone);
    const contact = await ContactService.getContactByRemoteJid(
      req.instance!.userId,
      req.instance!._id,
      remoteJid
    );

    if (!contact) {
      return next(createNotFoundError('Contato não encontrado'));
    }

    // Remover label do contato (usar UUID da label, não o labelId que pode ser short_id)
    await LabelService.removeLabelFromContact(contact.id, label.id);

    await emitContactUpdated(req.instance!.userId, req.instance!._id);

    res.status(200).json({
      status: 'success',
      message: 'Label removida do contato com sucesso',
      data: {
        contactId: contact.id,
        labelId: label.id,
        labelName: label.name,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao remover label do contato'));
  }
};

