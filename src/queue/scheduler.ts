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
  
  // Verificar se já existem jobs para este disparo (evitar duplicação)
  const existingJobsCheck = await pgPool.query(
    `SELECT COUNT(*) as count FROM dispatch_jobs WHERE dispatch_id = $1`,
    [dispatchId]
  );

  if (parseInt(existingJobsCheck.rows[0].count) > 0) {
    console.log(`⚠️ Jobs já existem para o disparo ${dispatchId}. Não criando novos jobs para evitar duplicação.`);
    return;
  }

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

    // Adicionar job na queue (armazenar jobId do PostgreSQL nos dados do job)
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
        jobId, // ID do job no PostgreSQL
      },
      {
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
 * Retomar disparos que estavam em execução antes do reinício
 */
export const resumeRunningDispatches = async (): Promise<void> => {
  try {
    console.log('🔄 Verificando disparos em execução para retomar...');

    // Buscar todos os disparos com status 'running'
    const result = await pgPool.query(
      `SELECT * FROM dispatches WHERE status = 'running'`
    );

    if (result.rows.length === 0) {
      console.log('✅ Nenhum disparo em execução encontrado');
      return;
    }

    console.log(`📋 Encontrados ${result.rows.length} disparo(s) em execução`);

    for (const dispatchRow of result.rows) {
      const dispatchId = dispatchRow.id;
      const userId = dispatchRow.user_id;
      const instanceId = dispatchRow.instance_id;

      try {
        // Buscar instância
        const instance = await Instance.findById(instanceId);
        if (!instance) {
          console.error(`⚠️ Instância ${instanceId} não encontrada para disparo ${dispatchId}`);
          // Marcar disparo como failed se a instância não existir
          await DispatchService.update(dispatchId, userId, {
            status: 'failed',
          });
          continue;
        }

        // Buscar jobs pendentes para este disparo
        const jobsResult = await pgPool.query(
          `SELECT id, contact_data, scheduled_at FROM dispatch_jobs 
           WHERE dispatch_id = $1 AND status = 'pending' 
           ORDER BY scheduled_at ASC`,
          [dispatchId]
        );

        if (jobsResult.rows.length === 0) {
          console.log(`ℹ️ Nenhum job pendente encontrado para disparo ${dispatchId}`);
          // Verificar se todos os jobs foram concluídos
          const allJobsResult = await pgPool.query(
            `SELECT COUNT(*) as total, 
                    SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                    SUM(CASE WHEN status = 'invalid' THEN 1 ELSE 0 END) as invalid
             FROM dispatch_jobs WHERE dispatch_id = $1`,
            [dispatchId]
          );

          const { total, sent, failed, invalid } = allJobsResult.rows[0];
          const completed = parseInt(sent) + parseInt(failed) + parseInt(invalid);

          if (completed === parseInt(total)) {
            // Todos os jobs foram concluídos, marcar disparo como completed
            await DispatchService.update(dispatchId, userId, {
              status: 'completed',
              completedAt: new Date(),
            });
            console.log(`✅ Disparo ${dispatchId} marcado como concluído`);
          }
          continue;
        }

        console.log(`🔄 Retomando ${jobsResult.rows.length} job(s) pendente(s) para disparo ${dispatchId}`);

        // Buscar dados do disparo
        const dispatch = {
          id: dispatchRow.id,
          userId: dispatchRow.user_id,
          instanceId: dispatchRow.instance_id,
          templateId: dispatchRow.template_id,
          settings: typeof dispatchRow.settings === 'string' ? JSON.parse(dispatchRow.settings) : dispatchRow.settings,
          defaultName: dispatchRow.default_name,
        };

        // Recriar jobs na queue
        for (const jobRow of jobsResult.rows) {
          const jobId = jobRow.id;
          const contactData = typeof jobRow.contact_data === 'string' 
            ? JSON.parse(jobRow.contact_data) 
            : jobRow.contact_data;
          const scheduledAt = new Date(jobRow.scheduled_at);

          // Calcular delay até o scheduled_at
          const delay = Math.max(0, scheduledAt.getTime() - Date.now());

          try {
            // Adicionar job na queue (armazenar jobId do PostgreSQL nos dados do job)
            await dispatchQueue.add(
              'dispatch',
              {
                dispatchId,
                userId: dispatch.userId,
                instanceId: dispatch.instanceId,
                instanceName: instance.instanceName,
                templateId: dispatch.templateId,
                contactData,
                defaultName: dispatch.defaultName || null,
                settings: dispatch.settings,
                jobId, // ID do job no PostgreSQL
              },
              {
                delay,
                attempts: 3,
              }
            );

            console.log(`✅ Job ${jobId} recriado na queue (delay: ${delay}ms)`);
          } catch (jobError: any) {
            console.error(`❌ Erro ao recriar job ${jobId}:`, jobError.message);
            // Continuar com os próximos jobs mesmo se um falhar
          }
        }

        console.log(`✅ Disparo ${dispatchId} retomado com sucesso`);
      } catch (dispatchError: any) {
        console.error(`❌ Erro ao retomar disparo ${dispatchId}:`, dispatchError.message);
        // Continuar com os próximos disparos mesmo se um falhar
      }
    }

    console.log('✅ Verificação de disparos em execução concluída');
  } catch (error: any) {
    console.error('❌ Erro ao retomar disparos em execução:', error.message);
  }
};

/**
 * Iniciar scheduler (executar a cada minuto)
 */
export const startScheduler = async (): Promise<void> => {
  // Retomar disparos que estavam em execução antes do reinício
  await resumeRunningDispatches();

  // Executar processamento de disparos agendados imediatamente
  processScheduledDispatches();

  // Executar a cada minuto
  setInterval(() => {
    processScheduledDispatches();
  }, 60000); // 60 segundos
};

