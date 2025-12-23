/**
 * Service para gerenciar Agentes de IA
 */

import { pgPool } from '../config/databases';
import { parseJsonbField } from '../utils/dbHelpers';

export interface AIAgent {
  id: string;
  userId: string;
  instanceId: string;
  name: string;
  prompt: string;
  waitTime: number;
  isActive: boolean;
  transcribeAudio: boolean;
  agentType: 'manual' | 'assisted';
  assistedConfig?: any; // Configuração do formulário assistido (JSON)
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAIAgentData {
  userId: string;
  instanceId: string;
  name: string;
  prompt: string;
  waitTime?: number;
  isActive?: boolean;
  transcribeAudio?: boolean;
  agentType?: 'manual' | 'assisted';
  assistedConfig?: any;
}

export interface UpdateAIAgentData {
  name?: string;
  prompt?: string;
  waitTime?: number;
  isActive?: boolean;
  transcribeAudio?: boolean;
  agentType?: 'manual' | 'assisted';
  assistedConfig?: any;
}

export class AIAgentService {
  /**
   * Criar novo agente de IA
   */
  static async create(data: CreateAIAgentData): Promise<AIAgent> {
    const query = `
      INSERT INTO ai_agents (user_id, instance_id, name, prompt, wait_time, is_active, transcribe_audio, agent_type, assisted_config)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      data.userId,
      data.instanceId,
      data.name.trim(),
      data.prompt,
      data.waitTime || 13,
      data.isActive !== undefined ? data.isActive : true,
      data.transcribeAudio !== undefined ? data.transcribeAudio : true,
      data.agentType || 'manual',
      data.assistedConfig ? JSON.stringify(data.assistedConfig) : null,
    ];

    const result = await pgPool.query(query, values);
    return this.mapRowToAgent(result.rows[0]);
  }

  /**
   * Obter agente por ID
   */
  static async getById(id: string, userId: string): Promise<AIAgent | null> {
    const query = `
      SELECT * FROM ai_agents
      WHERE id = $1 AND user_id = $2
    `;

    const result = await pgPool.query(query, [id, userId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToAgent(result.rows[0]);
  }

  /**
   * Obter todos os agentes de um usuário
   */
  static async getByUserId(userId: string): Promise<AIAgent[]> {
    const query = `
      SELECT * FROM ai_agents
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;

    const result = await pgPool.query(query, [userId]);
    return result.rows.map((row) => this.mapRowToAgent(row));
  }

  /**
   * Obter agente ativo por instância
   */
  static async getActiveByInstance(instanceId: string): Promise<AIAgent | null> {
    const query = `
      SELECT * FROM ai_agents
      WHERE instance_id = $1 AND is_active = true
      LIMIT 1
    `;

    const result = await pgPool.query(query, [instanceId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToAgent(result.rows[0]);
  }

  /**
   * Atualizar agente
   */
  static async update(id: string, userId: string, data: UpdateAIAgentData): Promise<AIAgent | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(data.name.trim());
    }

    if (data.prompt !== undefined) {
      updates.push(`prompt = $${paramCount++}`);
      values.push(data.prompt);
    }

    if (data.waitTime !== undefined) {
      updates.push(`wait_time = $${paramCount++}`);
      values.push(data.waitTime);
    }

    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(data.isActive);
    }

    if (data.transcribeAudio !== undefined) {
      updates.push(`transcribe_audio = $${paramCount++}`);
      values.push(data.transcribeAudio);
    }

    if (data.agentType !== undefined) {
      updates.push(`agent_type = $${paramCount++}`);
      values.push(data.agentType);
    }

    if (data.assistedConfig !== undefined) {
      updates.push(`assisted_config = $${paramCount++}`);
      values.push(data.assistedConfig ? JSON.stringify(data.assistedConfig) : null);
    }

    if (updates.length === 0) {
      return this.getById(id, userId);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id, userId);

    const query = `
      UPDATE ai_agents
      SET ${updates.join(', ')}
      WHERE id = $${paramCount++} AND user_id = $${paramCount++}
      RETURNING *
    `;

    const result = await pgPool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToAgent(result.rows[0]);
  }

  /**
   * Deletar agente
   */
  static async delete(id: string, userId: string): Promise<boolean> {
    const query = `
      DELETE FROM ai_agents
      WHERE id = $1 AND user_id = $2
    `;

    const result = await pgPool.query(query, [id, userId]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Mapear row do PostgreSQL para objeto AIAgent
   */
  private static mapRowToAgent(row: any): AIAgent {
    return {
      id: row.id,
      userId: row.user_id,
      instanceId: row.instance_id,
      name: row.name,
      prompt: row.prompt,
      waitTime: row.wait_time,
      isActive: row.is_active,
      transcribeAudio: row.transcribe_audio !== undefined ? row.transcribe_audio : true,
      agentType: (row.agent_type || 'manual') as 'manual' | 'assisted',
      assistedConfig: parseJsonbField(row.assisted_config, undefined),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

