import { Response, NextFunction } from 'express';
import multer from 'multer';
import Instance from '../models/Instance'; // Ainda no MongoDB
import { AuthRequest } from '../middleware/auth';
import { requestEvolutionAPI } from '../utils/evolutionAPI';
import { uploadFileToService, detectMediaType } from '../utils/mediaService';
import { createValidationError, createNotFoundError, handleControllerError } from '../utils/errorHelpers';
import { ContactService } from '../services/contactService';
import { MessageService } from '../services/messageService';
import { extractMessageId } from '../utils/webhookAPIHelpers';

/**
 * Obter mensagens de um contato (com paginação)
 */
export const getMessages = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { contactId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const useCache = req.query.cache !== 'false'; // Cache habilitado por padrão

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    // Verificar se o contato pertence ao usuário
    const contact = await ContactService.getContactById(contactId, userId);
    if (!contact) {
      return next(createNotFoundError('Contato'));
    }

    // Buscar mensagens com paginação e cache
    const result = await MessageService.getMessages({
      contactId,
      userId,
      page,
      limit,
      useCache,
    });

    // Marcar mensagens como lidas
    await MessageService.markAsRead(contactId, userId);

    // Resetar contador de não lidas
    await ContactService.resetUnreadCount(contactId, userId);

    res.status(200).json({
      status: 'success',
      count: result.messages.length,
      page: result.page,
      limit: result.limit,
      hasMore: result.hasMore,
      messages: result.messages.map((msg) => ({
        id: msg.id,
        messageId: msg.messageId,
        fromMe: msg.fromMe,
        messageType: msg.messageType,
        content: msg.content,
        mediaUrl: msg.mediaUrl || null,
        timestamp: msg.timestamp.toISOString(),
        read: msg.read,
      })),
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao obter mensagens'));
  }
};

// Configuração do multer para upload de arquivos
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (req, file, cb) => {
    // Permitir imagens, vídeos e áudios
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/quicktime',
      'audio/mpeg',
      'audio/mp3',
      'audio/ogg',
      'audio/wav',
      'audio/webm', // Formato gravado pelo navegador
      'audio/x-m4a', // Formato alternativo
      'audio/m4a', // Formato alternativo
      'audio/aac', // Formato alternativo
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido. Use imagens, vídeos ou áudios.'));
    }
  },
});

/**
 * Middleware para upload de arquivo
 */
export const uploadMedia = upload.single('file');

/**
 * Enviar mídia (imagem/vídeo) via Evolution API
 */
export const sendMedia = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { contactId } = req.params;
    const { caption } = req.body;
    const file = req.file;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!file) {
      return next(createValidationError('Arquivo é obrigatório'));
    }

    // Buscar contato e verificar se pertence ao usuário
    const contact = await ContactService.getContactById(contactId, userId);
    if (!contact) {
      return next(createNotFoundError('Contato'));
    }

    // Buscar instância do MongoDB (ainda está lá)
    const instance = await Instance.findById(contact.instanceId);
    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    // Detectar tipo de mídia
    const { mediatype, messageType } = detectMediaType(file.mimetype);

    // Fazer upload para MidiaService
    const fileName = file.originalname || `media-${Date.now()}.${file.mimetype.split('/')[1]}`;
    const uploadResult = await uploadFileToService(
      file.buffer,
      fileName,
      file.mimetype
    );

    if (!uploadResult) {
      return next(createValidationError('Erro ao fazer upload do arquivo'));
    }

    // Enviar mídia via Evolution API
    const evolutionResponse = await requestEvolutionAPI(
      'POST',
      `/message/sendMedia/${encodeURIComponent(instance.instanceName)}`,
      {
        number: contact.remoteJid,
        mediatype,
        mimetype: file.mimetype,
        caption: caption || '',
        media: uploadResult.fullUrl,
        fileName: fileName,
      }
    );

    // Extrair messageId da resposta
    const sentMessageId = extractMessageId(evolutionResponse);

    // Criar registro da mensagem no PostgreSQL
    const now = new Date();
    const message = await MessageService.createMessage({
      userId: userId,
      instanceId: contact.instanceId, // String do ObjectId
      contactId: contact.id,
      remoteJid: contact.remoteJid,
      messageId: sentMessageId,
      fromMe: true,
      messageType,
      content: '[Mídia]',
      mediaUrl: uploadResult.fullUrl,
      timestamp: now,
      read: true,
    });

    res.status(200).json({
      status: 'success',
      message: 'Mídia enviada com sucesso',
      data: {
        id: message.id,
        messageId: message.messageId,
        fromMe: message.fromMe,
        messageType: message.messageType,
        content: message.content,
        mediaUrl: message.mediaUrl,
        timestamp: message.timestamp.toISOString(),
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao enviar mídia'));
  }
};

/**
 * Enviar áudio via Evolution API
 */
export const sendAudio = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { contactId } = req.params;
    const file = req.file;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!file) {
      return next(createValidationError('Arquivo de áudio é obrigatório'));
    }

    // Verificar se é áudio
    if (!file.mimetype.startsWith('audio/')) {
      return next(createValidationError('Arquivo deve ser um áudio'));
    }

    // Buscar contato e verificar se pertence ao usuário
    const contact = await ContactService.getContactById(contactId, userId);
    if (!contact) {
      return next(createNotFoundError('Contato'));
    }

    // Buscar instância do MongoDB (ainda está lá)
    const instance = await Instance.findById(contact.instanceId);
    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    // Fazer upload para MidiaService
    const fileName = file.originalname || `audio-${Date.now()}.${file.mimetype.split('/')[1]}`;
    const uploadResult = await uploadFileToService(
      file.buffer,
      fileName,
      file.mimetype
    );

    if (!uploadResult) {
      return next(createValidationError('Erro ao fazer upload do áudio'));
    }

    // Enviar áudio via Evolution API
    const evolutionResponse = await requestEvolutionAPI(
      'POST',
      `/message/sendWhatsAppAudio/${encodeURIComponent(instance.instanceName)}`,
      {
        number: contact.remoteJid,
        audio: uploadResult.fullUrl,
      }
    );

    // Extrair messageId da resposta
    const sentMessageId = extractMessageId(evolutionResponse);

    // Criar registro da mensagem no PostgreSQL
    const now = new Date();
    const message = await MessageService.createMessage({
      userId: userId,
      instanceId: contact.instanceId, // String do ObjectId
      contactId: contact.id,
      remoteJid: contact.remoteJid,
      messageId: sentMessageId,
      fromMe: true,
      messageType: 'audioMessage',
      content: '[Mídia]',
      mediaUrl: uploadResult.fullUrl,
      timestamp: now,
      read: true,
    });

    res.status(200).json({
      status: 'success',
      message: 'Áudio enviado com sucesso',
      data: {
        id: message.id,
        messageId: message.messageId,
        fromMe: message.fromMe,
        messageType: message.messageType,
        content: message.content,
        mediaUrl: message.mediaUrl,
        timestamp: message.timestamp.toISOString(),
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao enviar áudio'));
  }
};

/**
 * Enviar mensagem via Evolution API
 */
export const sendMessage = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { contactId } = req.params;
    const { text } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!text || text.trim().length === 0) {
      return next(createValidationError('Texto da mensagem é obrigatório'));
    }

    // Buscar contato e verificar se pertence ao usuário
    const contact = await ContactService.getContactById(contactId, userId);
    if (!contact) {
      return next(createNotFoundError('Contato'));
    }

    // Buscar instância do MongoDB (ainda está lá)
    const instance = await Instance.findById(contact.instanceId);
    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    // Enviar mensagem via Evolution API
    const evolutionResponse = await requestEvolutionAPI(
      'POST',
      `/message/sendText/${encodeURIComponent(instance.instanceName)}`,
      {
        number: contact.remoteJid,
        text: text.trim(),
      }
    );

    // Extrair messageId da resposta
    const sentMessageId = extractMessageId(evolutionResponse);

    // Criar registro da mensagem no PostgreSQL
    const now = new Date();
    const message = await MessageService.createMessage({
      userId: userId,
      instanceId: contact.instanceId, // String do ObjectId
      contactId: contact.id,
      remoteJid: contact.remoteJid,
      messageId: sentMessageId,
      fromMe: true,
      messageType: 'conversation',
      content: text.trim(),
      timestamp: now,
      read: true,
    });

    res.status(200).json({
      status: 'success',
      message: 'Mensagem enviada com sucesso',
      data: {
        id: message.id,
        messageId: message.messageId,
        fromMe: message.fromMe,
        content: message.content,
        timestamp: message.timestamp.toISOString(),
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao enviar mensagem'));
  }
};
