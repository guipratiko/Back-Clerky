/**
 * Service para gerenciar memória/conversação da OpenAI por contato
 */

import { pgPool } from '../config/databases';
import { parseJsonbField } from '../utils/dbHelpers';

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface OpenAIMemory {
  id: string;
  workflowId: string;
  contactPhone: string;
  instanceId: string;
  messages: ConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export class OpenAIMemoryService {
  /**
   * Obter ou criar memória para um contato
   */
  static async getOrCreateMemory(
    workflowId: string,
    contactPhone: string,
    instanceId: string
  ): Promise<OpenAIMemory> {
    const query = `
      SELECT * FROM openai_memory
      WHERE workflow_id = $1 AND contact_phone = $2 AND instance_id = $3
    `;

    const result = await pgPool.query(query, [workflowId, contactPhone, instanceId]);

    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        id: row.id,
        workflowId: row.workflow_id,
        contactPhone: row.contact_phone,
        instanceId: row.instance_id,
        messages: parseJsonbField<ConversationMessage[]>(row.messages, []),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }

    // Criar nova memória
    const insertQuery = `
      INSERT INTO openai_memory (workflow_id, contact_phone, instance_id, messages)
      VALUES ($1, $2, $3, '[]'::jsonb)
      RETURNING *
    `;

    const insertResult = await pgPool.query(insertQuery, [workflowId, contactPhone, instanceId]);
    const row = insertResult.rows[0];

    return {
      id: row.id,
      workflowId: row.workflow_id,
      contactPhone: row.contact_phone,
      instanceId: row.instance_id,
      messages: [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Adicionar mensagem à memória
   */
  static async addMessage(
    workflowId: string,
    contactPhone: string,
    instanceId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<void> {
    const memory = await this.getOrCreateMemory(workflowId, contactPhone, instanceId);
    
    const newMessage: ConversationMessage = {
      role,
      content,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...memory.messages, newMessage];

    // Limitar a 20 mensagens mais recentes para não exceder limites da API
    const limitedMessages = updatedMessages.slice(-20);

    const updateQuery = `
      UPDATE openai_memory
      SET messages = $1::jsonb, updated_at = CURRENT_TIMESTAMP
      WHERE workflow_id = $2 AND contact_phone = $3 AND instance_id = $4
    `;

    await pgPool.query(updateQuery, [
      JSON.stringify(limitedMessages),
      workflowId,
      contactPhone,
      instanceId,
    ]);
  }

  /**
   * Obter histórico de mensagens
   */
  static async getMessages(
    workflowId: string,
    contactPhone: string,
    instanceId: string
  ): Promise<ConversationMessage[]> {
    const memory = await this.getOrCreateMemory(workflowId, contactPhone, instanceId);
    return memory.messages;
  }

  /**
   * Limpar memória de um contato
   */
  static async clearMemory(
    workflowId: string,
    contactPhone: string,
    instanceId: string
  ): Promise<void> {
    const query = `
      UPDATE openai_memory
      SET messages = '[]'::jsonb, updated_at = CURRENT_TIMESTAMP
      WHERE workflow_id = $1 AND contact_phone = $2 AND instance_id = $3
    `;

    await pgPool.query(query, [workflowId, contactPhone, instanceId]);
  }

  /**
   * Deletar memória de um contato
   */
  static async deleteMemory(
    workflowId: string,
    contactPhone: string,
    instanceId: string
  ): Promise<void> {
    const query = `
      DELETE FROM openai_memory
      WHERE workflow_id = $1 AND contact_phone = $2 AND instance_id = $3
    `;

    await pgPool.query(query, [workflowId, contactPhone, instanceId]);
  }
}

