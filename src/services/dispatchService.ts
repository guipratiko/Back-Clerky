/**
 * Service para gerenciamento de Disparos
 * Trabalha com PostgreSQL
 */

import { pgPool } from '../config/databases';
import { emitDispatchUpdate } from '../socket/socketServer';
import { parseJsonbField, stringifyJsonb } from '../utils/dbHelpers';

export type DispatchStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';

export interface Dispatch {
  id: string;
  userId: string;
  instanceId: string;
  templateId: string | null;
  name: string;
  status: DispatchStatus;
  settings: DispatchSettings;
  schedule: DispatchSchedule | null;
  contactsData: ContactData[];
  stats: DispatchStats;
  defaultName: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface DispatchSettings {
  speed: 'fast' | 'normal' | 'slow' | 'randomized'; // Velocidade do disparo
  autoDelete?: boolean; // Excluir mensagem automaticamente
  deleteDelay?: number; // Delay antes de excluir (em segundos)
  deleteDelayUnit?: 'seconds' | 'minutes' | 'hours'; // Unidade do delay de exclusão
}

export interface DispatchSchedule {
  startTime: string; // Horário de início (HH:mm)
  endTime: string; // Horário de pausa (HH:mm)
  suspendedDays: number[]; // Dias da semana suspensos (0=domingo, 6=sábado)
}

export interface ContactData {
  phone: string; // Número normalizado
  name?: string; // Nome do contato
  formattedPhone?: string; // Número formatado
  columnId?: string; // Se veio do Kanban
}

export interface DispatchStats {
  sent: number;
  failed: number;
  invalid: number;
  total: number;
}

export interface CreateDispatchData {
  userId: string;
  instanceId: string;
  templateId?: string | null;
  name: string;
  settings: DispatchSettings;
  schedule?: DispatchSchedule | null;
  contactsData: ContactData[];
  defaultName?: string | null;
}

export interface UpdateDispatchData {
  name?: string;
  status?: DispatchStatus;
  settings?: DispatchSettings;
  schedule?: DispatchSchedule | null;
  stats?: DispatchStats;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

export class DispatchService {
  /**
   * Criar novo disparo
   */
  static async create(data: CreateDispatchData): Promise<Dispatch> {
    try {
      // Calcular estatísticas iniciais
      const stats: DispatchStats = {
        sent: 0,
        failed: 0,
        invalid: 0,
        total: data.contactsData.length,
      };

      console.log('💾 Criando disparo no banco:', {
        userId: data.userId,
        instanceId: data.instanceId,
        templateId: data.templateId,
        name: data.name,
        contactsCount: data.contactsData.length,
        hasSchedule: !!data.schedule,
      });

      const query = `
      INSERT INTO dispatches (
        user_id, instance_id, template_id, name, status,
        settings, schedule, contacts_data, stats, default_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

      const values = [
        data.userId,
        data.instanceId,
        data.templateId || null,
        data.name,
        'pending',
        stringifyJsonb(data.settings),
        stringifyJsonb(data.schedule),
        stringifyJsonb(data.contactsData),
        stringifyJsonb(stats),
        data.defaultName || null,
      ];

      console.log('📝 Executando query SQL com valores:', {
        userId: data.userId,
        instanceId: data.instanceId,
        templateId: data.templateId,
        name: data.name,
        settingsLength: stringifyJsonb(data.settings)?.length || 0,
        contactsDataLength: stringifyJsonb(data.contactsData)?.length || 0,
      });

      const result = await pgPool.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Falha ao criar disparo: nenhuma linha retornada');
      }

      const dispatch = this.mapRowToDispatch(result.rows[0]);
      console.log('✅ Disparo criado no banco:', dispatch.id);
      return dispatch;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error('❌ Erro ao criar disparo no banco:', errorMessage);
      if (error && typeof error === 'object' && 'code' in error) {
        console.error('   Código PostgreSQL:', (error as { code: string }).code);
      }
      if (error && typeof error === 'object' && 'detail' in error) {
        console.error('   Detalhes:', error.detail);
      }
      throw error;
    }
  }

  /**
   * Buscar disparo por ID
   */
  static async getById(dispatchId: string, userId: string): Promise<Dispatch | null> {
    const query = `
      SELECT * FROM dispatches
      WHERE id = $1 AND user_id = $2
    `;

    const result = await pgPool.query(query, [dispatchId, userId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToDispatch(result.rows[0]);
  }

  /**
   * Listar todos os disparos de um usuário
   */
  static async getByUserId(
    userId: string,
    status?: DispatchStatus
  ): Promise<Dispatch[]> {
    let query = `
      SELECT * FROM dispatches
      WHERE user_id = $1
    `;
    const params: any[] = [userId];

    if (status) {
      query += ` AND status = $2`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pgPool.query(query, params);

    return result.rows.map((row) => this.mapRowToDispatch(row));
  }

  /**
   * Atualizar disparo
   */
  static async update(
    dispatchId: string,
    userId: string,
    data: UpdateDispatchData
  ): Promise<Dispatch | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(data.name);
    }

    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(data.status);
    }

    if (data.settings !== undefined) {
      updates.push(`settings = $${paramIndex++}`);
      params.push(stringifyJsonb(data.settings));
    }

    if (data.schedule !== undefined) {
      updates.push(`schedule = $${paramIndex++}`);
      params.push(stringifyJsonb(data.schedule));
    }

    if (data.stats !== undefined) {
      updates.push(`stats = $${paramIndex++}`);
      params.push(stringifyJsonb(data.stats));
    }

    if (data.startedAt !== undefined) {
      updates.push(`started_at = $${paramIndex++}`);
      params.push(data.startedAt);
    }

    if (data.completedAt !== undefined) {
      updates.push(`completed_at = $${paramIndex++}`);
      params.push(data.completedAt);
    }

    if (updates.length === 0) {
      return this.getById(dispatchId, userId);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(dispatchId, userId);

    const query = `
      UPDATE dispatches
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
      RETURNING *
    `;

    const result = await pgPool.query(query, params);

    if (result.rows.length === 0) {
      return null;
    }

    const updatedDispatch = this.mapRowToDispatch(result.rows[0]);
    
    // Emitir evento WebSocket para atualização em tempo real
    try {
      emitDispatchUpdate(userId, updatedDispatch);
    } catch (error: unknown) {
      // Não falhar se houver erro ao emitir evento
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error('Erro ao emitir evento de atualização de disparo:', errorMessage);
    }

    return updatedDispatch;
  }

  /**
   * Atualizar estatísticas de um disparo
   */
  static async updateStats(
    dispatchId: string,
    userId: string,
    stats: Partial<DispatchStats>
  ): Promise<Dispatch | null> {
    // Buscar stats atuais
    const current = await this.getById(dispatchId, userId);
    if (!current) {
      return null;
    }

    // Mesclar stats
    const updatedStats: DispatchStats = {
      ...current.stats,
      ...stats,
    };

    return this.update(dispatchId, userId, { stats: updatedStats });
  }

  /**
   * Deletar disparo
   */
  static async delete(dispatchId: string, userId: string): Promise<boolean> {
    const query = `
      DELETE FROM dispatches
      WHERE id = $1 AND user_id = $2
    `;

    const result = await pgPool.query(query, [dispatchId, userId]);

    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Buscar disparos que precisam ser processados (agendados)
   */
  static async getScheduledDispatches(): Promise<Dispatch[]> {
    const query = `
      SELECT * FROM dispatches
      WHERE status IN ('pending', 'paused')
        AND schedule IS NOT NULL
      ORDER BY created_at ASC
    `;

    const result = await pgPool.query(query);

    return result.rows.map((row) => this.mapRowToDispatch(row));
  }

  /**
   * Mapear row do banco para Dispatch
   */
  private static mapRowToDispatch(row: any): Dispatch {
    // Garantir valores padrão para campos JSONB usando helper
    const settings = parseJsonbField(row.settings, {});
    const schedule = parseJsonbField<DispatchSchedule | null>(row.schedule, null);
    const contactsData = parseJsonbField<any[]>(row.contacts_data, []);
    const stats = parseJsonbField<DispatchStats>(
      row.stats,
      { sent: 0, failed: 0, invalid: 0, total: 0 }
    );

    return {
      id: row.id,
      userId: row.user_id,
      instanceId: row.instance_id,
      templateId: row.template_id || null,
      name: row.name,
      status: row.status || 'pending',
      settings,
      schedule,
      contactsData,
      stats,
      defaultName: row.default_name || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at || null,
      completedAt: row.completed_at || null,
    };
  }
}

