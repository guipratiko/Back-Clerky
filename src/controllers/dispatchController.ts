import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  createValidationError,
  createNotFoundError,
  handleControllerError,
} from '../utils/errorHelpers';
import { DispatchService, DispatchSettings, DispatchSchedule } from '../services/dispatchService';
import { TemplateService } from '../services/templateService';
import { ContactService } from '../services/contactService';
import { validateContacts, filterValidContacts } from '../services/contactValidationService';
import { parseCSVFile, parseInputText, parseCSVText } from '../utils/csvParser';
import { normalizePhoneList } from '../utils/numberNormalizer';
import { createDispatchJobs } from '../queue/scheduler';
import { pgPool } from '../config/databases';
import Instance from '../models/Instance';
import multer from 'multer';

// Configurar multer para upload de CSV
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos CSV são permitidos'));
    }
  },
});

/**
 * Criar novo disparo
 * POST /api/dispatches
 */
export const createDispatch = async (
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
      templateId,
      name,
      settings,
      schedule,
      contactsSource,
      contactsData,
      columnIds,
      defaultName,
    } = req.body;

    // Debug: log do que está sendo recebido
    console.log('📥 Dados recebidos para criar disparo:', {
      instanceId,
      templateId,
      name,
      settings,
      contactsSource,
      contactsDataLength: contactsData?.length,
      columnIds,
    });

    // Validações básicas
    if (!instanceId || !name || !settings || !contactsSource) {
      const missing = [];
      if (!instanceId) missing.push('instanceId');
      if (!name) missing.push('name');
      if (!settings) missing.push('settings');
      if (!contactsSource) missing.push('contactsSource');
      return next(createValidationError(`Campos obrigatórios faltando: ${missing.join(', ')}`));
    }

    // Validar settings
    if (!settings.speed || !['fast', 'normal', 'slow', 'randomized'].includes(settings.speed)) {
      return next(createValidationError('settings.speed deve ser: fast, normal, slow ou randomized'));
    }

    // Buscar instância
    const instance = await Instance.findById(instanceId);
    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    // Buscar template se fornecido
    if (templateId) {
      const template = await TemplateService.getById(templateId, userId);
      if (!template) {
        return next(createNotFoundError('Template'));
      }
    }

    // Processar contatos baseado na fonte
    let processedContacts: Array<{ phone: string; name?: string; columnId?: string }> = [];

    if (contactsSource === 'kanban') {
      // Contatos do Kanban
      if (!columnIds || !Array.isArray(columnIds) || columnIds.length === 0) {
        return next(createValidationError('columnIds é obrigatório quando contactsSource é kanban'));
      }

      // Buscar contatos das colunas
      for (const columnId of columnIds) {
        const allContacts = await ContactService.getContactsByUserId(userId, instanceId);
        const contacts = allContacts.filter((c) => c.columnId === columnId);
        processedContacts.push(
          ...contacts.map((c) => ({
            phone: c.phone,
            name: c.name,
            columnId: c.columnId || undefined,
          }))
        );
      }
    } else if (contactsSource === 'list') {
      // Contatos da lista (já processados no frontend ou via upload)
      if (!contactsData || !Array.isArray(contactsData)) {
        return next(createValidationError('contactsData é obrigatório quando contactsSource é list'));
      }
      processedContacts = contactsData;
    } else {
      return next(createValidationError('contactsSource inválido'));
    }

    if (processedContacts.length === 0) {
      return next(createValidationError('Nenhum contato fornecido'));
    }

    // Normalizar números
    const normalizedContacts = processedContacts.map((c) => ({
      ...c,
      phone: normalizePhoneList([c.phone])[0] || c.phone,
    }));

    // Validar números (se o endpoint estiver disponível)
    let validatedContacts;
    let validationAvailable = true;
    try {
      validatedContacts = await validateContacts(instance.instanceName, normalizedContacts);
      console.log(`📊 Resultado da validação: ${validatedContacts.length} contatos processados`);
      console.log(`   Válidos: ${validatedContacts.filter(c => c.validated).length}`);
      console.log(`   Inválidos: ${validatedContacts.filter(c => !c.validated).length}`);
    } catch (error: unknown) {
      // Se a validação falhar (endpoint não existe), usar contatos sem validação
      console.warn('⚠️ Validação de números não disponível. Usando contatos sem validação.');
      validationAvailable = false;
      validatedContacts = normalizedContacts.map((c) => ({
        phone: c.phone,
        name: c.name,
        validated: true, // Aceitar todos se validação não estiver disponível
        validationResult: undefined,
      }));
    }

    // Filtrar apenas válidos (ou todos se validação não estiver disponível)
    let validContacts = filterValidContacts(validatedContacts);

    console.log(`✅ Contatos válidos: ${validContacts.length} de ${validatedContacts.length} (validação disponível: ${validationAvailable})`);
    
    // Se validação não está disponível e temos contatos normalizados, aceitar todos
    if (!validationAvailable && normalizedContacts.length > 0 && validContacts.length === 0) {
      console.log('⚠️ Nenhum contato válido após validação, mas validação não está disponível. Aceitando todos os contatos normalizados.');
      // Criar contatos válidos manualmente
      const manualValidContacts = normalizedContacts.map((c) => ({
        phone: c.phone,
        name: c.name,
        validated: true,
        validationResult: undefined,
      }));
      // Usar os contatos manuais
      validContacts = manualValidContacts;
    }

    if (validContacts.length === 0) {
      return next(createValidationError('Nenhum número válido encontrado'));
    }

    // Preparar dados do disparo
    // Garantir que todos os números estejam normalizados com DDI
    const contactsDataForDispatch = validContacts.map((c) => {
      // Normalizar número novamente para garantir que tem DDI
      const normalizedPhone = normalizePhoneList([c.phone])[0] || c.phone;
      return {
        phone: normalizedPhone,
        name: c.name,
        formattedPhone: c.validationResult?.number || normalizedPhone,
      };
    });

    console.log('📦 Preparando dados do disparo:', {
      userId,
      instanceId,
      templateId: templateId || null,
      name,
      contactsCount: contactsDataForDispatch.length,
      hasSchedule: !!schedule,
    });

    // Criar disparo
    let dispatch;
    try {
      dispatch = await DispatchService.create({
        userId,
        instanceId,
        templateId: templateId || null,
        name,
        settings: settings as DispatchSettings,
        schedule: schedule ? (schedule as DispatchSchedule) : null,
        contactsData: contactsDataForDispatch,
        defaultName: defaultName || null,
      });
      console.log('✅ Disparo criado com sucesso:', dispatch.id);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error('❌ Erro ao criar disparo no banco:', errorMessage);
      throw error;
    }

    // Não criar jobs automaticamente - o disparo será iniciado manualmente pelo usuário
    // Jobs serão criados quando o disparo for iniciado (via startDispatch ou resumeDispatch)
    console.log('✅ Disparo criado com status "pending". Use o botão "Iniciar" para começar o envio.');

    res.status(201).json({
      status: 'success',
      dispatch: {
        id: dispatch.id,
        name: dispatch.name,
        status: dispatch.status,
        stats: dispatch.stats,
        createdAt: dispatch.createdAt,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao criar disparo'));
  }
};

/**
 * Upload de CSV e processamento
 * POST /api/dispatches/upload-csv
 */
export const uploadCSV = upload.single('file');

export const processCSVUpload = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!req.file) {
      return next(createValidationError('Arquivo CSV é obrigatório'));
    }

    // Parsear CSV
    const contacts = await parseCSVFile(req.file.buffer);

    // Normalizar números
    const normalizedContacts = contacts.map((c) => ({
      ...c,
      phone: normalizePhoneList([c.phone])[0] || c.phone,
    }));

    res.status(200).json({
      status: 'success',
      contacts: normalizedContacts,
      count: normalizedContacts.length,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao processar CSV'));
  }
};

/**
 * Processar texto de entrada (campo de digitação)
 * POST /api/dispatches/process-input
 */
export const processInput = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const { inputText } = req.body;

    if (!inputText || typeof inputText !== 'string') {
      return next(createValidationError('inputText é obrigatório'));
    }

    // Parsear texto
    const contacts = parseInputText(inputText);

    // Normalizar números
    const normalizedContacts = contacts.map((c) => ({
      ...c,
      phone: normalizePhoneList([c.phone])[0] || c.phone,
    }));

    res.status(200).json({
      status: 'success',
      contacts: normalizedContacts,
      count: normalizedContacts.length,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao processar texto'));
  }
};

/**
 * Listar disparos do usuário
 * GET /api/dispatches
 */
export const getDispatches = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const status = req.query.status as any;

    const dispatches = await DispatchService.getByUserId(userId, status);

    res.status(200).json({
      status: 'success',
      dispatches: dispatches.map((d) => ({
        id: d.id,
        name: d.name,
        status: d.status,
        stats: d.stats,
        createdAt: d.createdAt,
        startedAt: d.startedAt,
        completedAt: d.completedAt,
      })),
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao listar disparos'));
  }
};

/**
 * Buscar disparo por ID
 * GET /api/dispatches/:id
 */
export const getDispatch = async (
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

    const dispatch = await DispatchService.getById(id, userId);

    if (!dispatch) {
      return next(createNotFoundError('Disparo'));
    }

    res.status(200).json({
      status: 'success',
      dispatch: {
        id: dispatch.id,
        name: dispatch.name,
        status: dispatch.status,
        settings: dispatch.settings,
        schedule: dispatch.schedule,
        stats: dispatch.stats,
        defaultName: dispatch.defaultName,
        createdAt: dispatch.createdAt,
        startedAt: dispatch.startedAt,
        completedAt: dispatch.completedAt,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao buscar disparo'));
  }
};

/**
 * Iniciar disparo (novo ou pausado)
 * POST /api/dispatches/:id/start
 */
export const startDispatch = async (
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

    // Verificar se o disparo existe e pertence ao usuário
    const dispatch = await DispatchService.getById(id, userId);
    if (!dispatch) {
      return next(createNotFoundError('Disparo'));
    }

    // Verificar se o disparo pode ser iniciado
    if (dispatch.status === 'running') {
      return next(createValidationError('Disparo já está em execução'));
    }

    if (dispatch.status === 'completed') {
      return next(createValidationError('Disparo já foi concluído'));
    }

    // Verificar se há jobs pendentes
    const { getPendingJobsCount } = await import('../queue/scheduler');
    const pendingJobsCount = await getPendingJobsCount(id);

    if (pendingJobsCount === 0) {
      // Criar jobs se não existirem
      console.log('📋 Criando jobs para o disparo...');
      await createDispatchJobs(id);
      console.log('✅ Jobs criados com sucesso');
    }

    // Atualizar status para running
    await DispatchService.update(id, userId, { 
      status: 'running',
      startedAt: new Date(),
    });

    res.status(200).json({
      status: 'success',
      message: 'Disparo iniciado com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao iniciar disparo'));
  }
};

/**
 * Pausar disparo
 * POST /api/dispatches/:id/pause
 */
export const pauseDispatch = async (
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

    const dispatch = await DispatchService.update(id, userId, { status: 'paused' });

    if (!dispatch) {
      return next(createNotFoundError('Disparo'));
    }

    res.status(200).json({
      status: 'success',
      message: 'Disparo pausado com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao pausar disparo'));
  }
};

/**
 * Retomar disparo
 * POST /api/dispatches/:id/resume
 */
export const resumeDispatch = async (
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

    const dispatch = await DispatchService.getById(id, userId);
    if (!dispatch) {
      return next(createNotFoundError('Disparo'));
    }

    // Se não tem jobs pendentes, criar novos
    const { getPendingJobsCount } = await import('../queue/scheduler');
    const pendingJobsCount = await getPendingJobsCount(id);

    if (pendingJobsCount === 0) {
      // Recriar jobs
      await createDispatchJobs(id);
    }

    await DispatchService.update(id, userId, { status: 'running' });

    res.status(200).json({
      status: 'success',
      message: 'Disparo retomado com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao retomar disparo'));
  }
};

/**
 * Deletar disparo
 * DELETE /api/dispatches/:id
 */
export const deleteDispatch = async (
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

    const deleted = await DispatchService.delete(id, userId);

    if (!deleted) {
      return next(createNotFoundError('Disparo'));
    }

    res.status(200).json({
      status: 'success',
      message: 'Disparo deletado com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao deletar disparo'));
  }
};

