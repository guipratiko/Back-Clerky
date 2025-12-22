/**
 * Scheduler para gerenciar agendamento de disparos
 * Verifica horários permitidos, dias suspensos e agenda jobs
 */

import { DispatchService, DispatchSchedule } from '../services/dispatchService';
import { TemplateService } from '../services/templateService';
import { dispatchQueue } from './dispatchQueue';
import { calculateDelay } from './dispatchProcessor';
import Instance from '../models/Instance';
import { pgPool } from '../config/databases';

/**
 * Verificar se é um dia permitido (não está suspenso)
 */
const isAllowedDay = (schedule: DispatchSchedule): boolean => {
  const today = new Date().getDay(); // 0 = domingo, 6 = sábado
  return !schedule.suspendedDays.includes(today);
};

/**
 * Verificar se está dentro do horário permitido
 */
const isWithinAllowedHours = (schedule: DispatchSchedule): boolean => {
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const [startHour, startMinute] = schedule.startTime.split(':').map(Number);
  const [endHour, endMinute] = schedule.endTime.split(':').map(Number);

  const startTime = startHour * 60 + startMinute;
  const endTime = endHour * 60 + endMinute;
  const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();

  return currentTimeMinutes >= startTime && currentTimeMinutes <= endTime;
};

/**
 * Calcular próximo horário permitido
 */
const calculateNextAllowedTime = (schedule: DispatchSchedule): Date => {
  const now = new Date();
  let nextTime = new Date(now);

  // Se não é dia permitido, avançar para próximo dia permitido
  while (!isAllowedDay(schedule)) {
    nextTime.setDate(nextTime.getDate() + 1);
    nextTime.setHours(0, 0, 0, 0);
  }

  // Se está fora do horário, ajustar para horário de início
  if (!isWithinAllowedHours(schedule)) {
    const [startHour, startMinute] = schedule.startTime.split(':').map(Number);
    
    // Se já passou do horário de fim hoje, ir para amanhã
    const [endHour, endMinute] = schedule.endTime.split(':').map(Number);
    const endTimeMinutes = endHour * 60 + endMinute;
    const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();

    if (currentTimeMinutes > endTimeMinutes) {
      nextTime.setDate(nextTime.getDate() + 1);
      nextTime.setHours(0, 0, 0, 0);
      
      // Avançar até próximo dia permitido
      while (!isAllowedDay(schedule)) {
        nextTime.setDate(nextTime.getDate() + 1);
      }
    }

    nextTime.setHours(startHour, startMinute, 0, 0);
  }

  return nextTime;
};

/**
 * Criar jobs para um disparo
 */
export const createDispatchJobs = async (dispatchId: string): Promise<void> => {
  // Buscar disparo (buscar sem filtro de userId para scheduler)
  const { pgPool } = await import('../config/databases');
  const result = await pgPool.query(
    `SELECT * FROM dispatches WHERE id = $1`,
    [dispatchId]
  );

  if (result.rows.length === 0) {
    throw new Error('Disparo não encontrado');
  }

  // Mapear row para Dispatch
  const row = result.rows[0];
  const dispatch = {
    id: row.id,
    userId: row.user_id,
    instanceId: row.instance_id,
    templateId: row.template_id,
    name: row.name,
    status: row.status,
    settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings,
    schedule: row.schedule && typeof row.schedule === 'string' ? JSON.parse(row.schedule) : row.schedule,
    contactsData: typeof row.contacts_data === 'string' ? JSON.parse(row.contacts_data) : row.contacts_data,
    stats: typeof row.stats === 'string' ? JSON.parse(row.stats) : row.stats,
    defaultName: row.default_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };

  // Buscar instância
  const instance = await Instance.findById(dispatch.instanceId);
  if (!instance) {
    throw new Error('Instância não encontrada');
  }

  // Buscar template se houver
  let template = null;
  if (dispatch.templateId) {
    template = await TemplateService.getById(dispatch.templateId, dispatch.userId);
  }

  if (!template) {
    throw new Error('Template não encontrado');
  }

  // Calcular delay baseado na velocidade
  const baseDelay = calculateDelay(dispatch.settings.speed);

  // Criar jobs para cada contato
  let scheduledTime = new Date();
  if (dispatch.schedule) {
    // Se tem agendamento, calcular próximo horário permitido
    scheduledTime = calculateNextAllowedTime(dispatch.schedule);
  }

  // Inserir jobs no banco e na queue
  for (let i = 0; i < dispatch.contactsData.length; i++) {
    const contact = dispatch.contactsData[i];

    // Calcular tempo de agendamento
    const jobScheduledTime = new Date(scheduledTime.getTime() + i * baseDelay);

    // Inserir job no banco
    const jobResult = await pgPool.query(
      `INSERT INTO dispatch_jobs (dispatch_id, contact_data, status, scheduled_at)
       VALUES ($1, $2, 'pending', $3)
       RETURNING id`,
      [dispatchId, JSON.stringify(contact), jobScheduledTime]
    );

    const jobId = jobResult.rows[0].id;

    // Adicionar job na queue
    await dispatchQueue.add(
      'dispatch',
      {
        dispatchId,
        userId: dispatch.userId,
        instanceId: dispatch.instanceId,
        instanceName: instance.instanceName,
        templateId: dispatch.templateId,
        contactData: contact,
        defaultName: dispatch.defaultName || null,
        settings: dispatch.settings,
      },
      {
        jobId,
        delay: Math.max(0, jobScheduledTime.getTime() - Date.now()),
        attempts: 3,
      }
    );
  }

  // Atualizar status do disparo
  await DispatchService.update(dispatchId, dispatch.userId, {
    status: 'running',
    startedAt: new Date(),
  });
};

/**
 * Verificar e processar disparos agendados
 */
export const processScheduledDispatches = async (): Promise<void> => {
  const dispatches = await DispatchService.getScheduledDispatches();

  for (const dispatch of dispatches) {
    try {
      if (!dispatch.schedule) {
        continue;
      }

      // Verificar se é dia permitido
      if (!isAllowedDay(dispatch.schedule)) {
        continue;
      }

      // Verificar se está dentro do horário
      if (!isWithinAllowedHours(dispatch.schedule)) {
        // Se está pausado e ainda não começou, aguardar
        if (dispatch.status === 'pending') {
          continue;
        }

        // Se está rodando e saiu do horário, pausar
        if (dispatch.status === 'running') {
          await DispatchService.update(dispatch.id, dispatch.userId, {
            status: 'paused',
          });
        }
        continue;
      }

      // Se está pausado e voltou ao horário, retomar
      if (dispatch.status === 'paused') {
        // Verificar se há jobs pendentes
        const pendingJobs = await pgPool.query(
          `SELECT COUNT(*) as count FROM dispatch_jobs
           WHERE dispatch_id = $1 AND status = 'pending'`,
          [dispatch.id]
        );

        if (parseInt(pendingJobs.rows[0].count) > 0) {
          // Retomar disparo
          await DispatchService.update(dispatch.id, dispatch.userId, {
            status: 'running',
          });
        }
      }

      // Se está pendente e dentro do horário, iniciar
      if (dispatch.status === 'pending') {
        await createDispatchJobs(dispatch.id);
      }
    } catch (error) {
      console.error(`Erro ao processar disparo ${dispatch.id}:`, error);
    }
  }
};

/**
 * Iniciar scheduler (executar a cada minuto)
 */
export const startScheduler = (): void => {
  // Executar imediatamente
  processScheduledDispatches();

  // Executar a cada minuto
  setInterval(() => {
    processScheduledDispatches();
  }, 60000); // 60 segundos
};

