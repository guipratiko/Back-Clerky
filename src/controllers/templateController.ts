import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  createValidationError,
  createNotFoundError,
  handleControllerError,
} from '../utils/errorHelpers';
import { TemplateService, TemplateType } from '../services/templateService';
import { uploadFileToService } from '../utils/mediaService';
import multer from 'multer';

// Configuração do multer para upload de arquivos de template
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

/**
 * Middleware para upload de arquivo de template
 */
export const uploadTemplateFile = upload.single('file');

/**
 * Criar novo template
 * POST /api/dispatches/templates
 */
export const createTemplate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const { name, type, content } = req.body;

    if (!name || !type || !content) {
      return next(createValidationError('Nome, tipo e conteúdo são obrigatórios'));
    }

    // Validar e sanitizar tipo
    const validTypes: TemplateType[] = [
      'text',
      'image',
      'image_caption',
      'video',
      'video_caption',
      'audio',
      'file',
      'sequence',
    ];

    // Garantir que o tipo está em minúsculas e sem espaços
    const sanitizedType = (type || '').toLowerCase().trim() as TemplateType;

    // Log para debug
    console.log('📝 Criando template:', { name, type: type, sanitizedType, valid: validTypes.includes(sanitizedType) });

    if (!validTypes.includes(sanitizedType)) {
      console.error('❌ Tipo inválido recebido:', { original: type, sanitized: sanitizedType, validTypes });
      return next(createValidationError(`Tipo de template inválido: ${type}. Tipos válidos: ${validTypes.join(', ')}`));
    }

    // Validar conteúdo de sequência se for o tipo
    if (sanitizedType === 'sequence') {
      const validation = TemplateService.validateSequenceContent(content);
      if (!validation.valid) {
        return next(createValidationError(validation.error || 'Conteúdo de sequência inválido'));
      }
    }

    const template = await TemplateService.create({
      userId,
      name,
      type: sanitizedType, // Usar tipo sanitizado
      content,
    });

    res.status(201).json({
      status: 'success',
      template: {
        id: template.id,
        name: template.name,
        type: template.type,
        content: template.content,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao criar template'));
  }
};

/**
 * Listar templates do usuário
 * GET /api/dispatches/templates
 */
export const getTemplates = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const type = req.query.type as TemplateType | undefined;

    const templates = await TemplateService.getByUserId(userId, type);

    res.status(200).json({
      status: 'success',
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        content: t.content,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao listar templates'));
  }
};

/**
 * Buscar template por ID
 * GET /api/dispatches/templates/:id
 */
export const getTemplate = async (
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

    const template = await TemplateService.getById(id, userId);

    if (!template) {
      return next(createNotFoundError('Template'));
    }

    res.status(200).json({
      status: 'success',
      template: {
        id: template.id,
        name: template.name,
        type: template.type,
        content: template.content,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao buscar template'));
  }
};

/**
 * Atualizar template
 * PUT /api/dispatches/templates/:id
 */
export const updateTemplate = async (
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
    const { name, content } = req.body;

    // Buscar template atual para validar tipo de sequência se necessário
    const currentTemplate = await TemplateService.getById(id, userId);
    if (!currentTemplate) {
      return next(createNotFoundError('Template'));
    }

    // Se está atualizando conteúdo e é sequência, validar
    if (content && currentTemplate.type === 'sequence') {
      const validation = TemplateService.validateSequenceContent(content);
      if (!validation.valid) {
        return next(createValidationError(validation.error || 'Conteúdo de sequência inválido'));
      }
    }

    const template = await TemplateService.update(id, userId, { name, content });

    if (!template) {
      return next(createNotFoundError('Template'));
    }

    res.status(200).json({
      status: 'success',
      template: {
        id: template.id,
        name: template.name,
        type: template.type,
        content: template.content,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao atualizar template'));
  }
};

/**
 * Deletar template
 * DELETE /api/dispatches/templates/:id
 */
export const deleteTemplate = async (
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

    const deleted = await TemplateService.delete(id, userId);

    if (!deleted) {
      return next(createNotFoundError('Template'));
    }

    res.status(200).json({
      status: 'success',
      message: 'Template deletado com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao deletar template'));
  }
};

/**
 * Upload de arquivo para template
 * POST /api/dispatches/templates/upload
 */
export const uploadTemplateFileHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const file = req.file;

    if (!file) {
      return next(createValidationError('Arquivo é obrigatório'));
    }

    // Gerar nome do arquivo
    const fileName = file.originalname || `template-${Date.now()}.${file.mimetype.split('/')[1] || 'bin'}`;

    // Fazer upload para MidiaService
    const uploadResult = await uploadFileToService(
      file.buffer,
      fileName,
      file.mimetype
    );

    if (!uploadResult) {
      return next(createValidationError('Erro ao fazer upload do arquivo'));
    }

    res.status(200).json({
      status: 'success',
      url: uploadResult.url,
      fullUrl: uploadResult.fullUrl,
      fileName,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao fazer upload do arquivo'));
  }
};

