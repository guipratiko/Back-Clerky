/**
 * Service para gerenciar mensagens automáticas de grupos (boas-vindas e despedida)
 * Trabalha com PostgreSQL
 */

import { pgPool } from '../config/databases';
import { sendMessage } from '../utils/evolutionAPI';

export interface GroupAutoMessage {
  id: string;
  userId: string;
  instanceId: string;
  groupId: string | null; // NULL = aplicar a todos os grupos
  isActive: boolean;
  messageType: 'welcome' | 'goodbye';
  messageText: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGroupAutoMessageData {
  userId: string;
  instanceId: string;
  groupId?: string | null; // NULL = aplicar a todos os grupos
  messageType: 'welcome' | 'goodbye';
  messageText: string;
  isActive?: boolean;
}

export interface UpdateGroupAutoMessageData {
  messageText?: string;
  isActive?: boolean;
}

export class GroupAutoMessageService {
  /**
   * Criar ou atualizar mensagem automática
   */
  static async upsertAutoMessage(
    data: CreateGroupAutoMessageData
  ): Promise<GroupAutoMessage> {
    // Primeiro tentar buscar existente
    const existing = await this.getAutoMessage(
      data.userId,
      data.instanceId,
      data.groupId || null,
      data.messageType
    );

    if (existing) {
      // Atualizar existente
      return this.updateAutoMessage(existing.id, data.userId, {
        messageText: data.messageText,
        isActive: data.isActive !== undefined ? data.isActive : true,
      });
    }

    // Criar novo
    const query = `
      INSERT INTO group_auto_messages (
        user_id, instance_id, group_id, message_type, message_text, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    try {
      const result = await pgPool.query(query, [
        data.userId,
        data.instanceId,
        data.groupId || null,
        data.messageType,
        data.messageText,
        data.isActive !== undefined ? data.isActive : true,
      ]);

      return this.mapRowToAutoMessage(result.rows[0]);
    } catch (error: any) {
      // Se der erro de constraint única, tentar atualizar
      if (error.code === '23505') {
        const existing = await this.getAutoMessage(
          data.userId,
          data.instanceId,
          data.groupId || null,
          data.messageType
        );
        if (existing) {
          return this.updateAutoMessage(existing.id, data.userId, {
            messageText: data.messageText,
            isActive: data.isActive !== undefined ? data.isActive : true,
          });
        }
      }
      throw error;
    }
  }

  /**
   * Obter mensagem automática específica
   */
  static async getAutoMessage(
    userId: string,
    instanceId: string,
    groupId: string | null,
    messageType: 'welcome' | 'goodbye'
  ): Promise<GroupAutoMessage | null> {
    const query = `
      SELECT * FROM group_auto_messages
      WHERE user_id = $1 
        AND instance_id = $2 
        AND (group_id = $3 OR (group_id IS NULL AND $3 IS NULL))
        AND message_type = $4
    `;

    const result = await pgPool.query(query, [userId, instanceId, groupId || null, messageType]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToAutoMessage(result.rows[0]);
  }

  /**
   * Obter todas as mensagens automáticas de uma instância
   */
  static async getAutoMessagesByInstance(
    userId: string,
    instanceId: string
  ): Promise<GroupAutoMessage[]> {
    const query = `
      SELECT * FROM group_auto_messages
      WHERE user_id = $1 AND instance_id = $2
      ORDER BY group_id NULLS LAST, message_type
    `;

    const result = await pgPool.query(query, [userId, instanceId]);
    return result.rows.map((row) => this.mapRowToAutoMessage(row));
  }

  /**
   * Obter mensagem automática para um grupo específico
   * Busca primeiro mensagem específica do grupo, depois mensagem global (groupId = NULL)
   */
  static async getAutoMessageForGroup(
    userId: string,
    instanceId: string,
    groupId: string,
    messageType: 'welcome' | 'goodbye'
  ): Promise<GroupAutoMessage | null> {
    // Primeiro tentar buscar mensagem específica do grupo
    const specificQuery = `
      SELECT * FROM group_auto_messages
      WHERE user_id = $1 
        AND instance_id = $2 
        AND group_id = $3
        AND message_type = $4
        AND is_active = TRUE
    `;

    const specificResult = await pgPool.query(specificQuery, [
      userId,
      instanceId,
      groupId,
      messageType,
    ]);

    if (specificResult.rows.length > 0) {
      return this.mapRowToAutoMessage(specificResult.rows[0]);
    }

    // Se não encontrou, buscar mensagem global (groupId = NULL)
    const globalQuery = `
      SELECT * FROM group_auto_messages
      WHERE user_id = $1 
        AND instance_id = $2 
        AND group_id IS NULL
        AND message_type = $4
        AND is_active = TRUE
    `;

    const globalResult = await pgPool.query(globalQuery, [userId, instanceId, messageType]);

    if (globalResult.rows.length > 0) {
      return this.mapRowToAutoMessage(globalResult.rows[0]);
    }

    return null;
  }

  /**
   * Atualizar mensagem automática
   */
  static async updateAutoMessage(
    id: string,
    userId: string,
    data: UpdateGroupAutoMessageData
  ): Promise<GroupAutoMessage> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.messageText !== undefined) {
      updates.push(`message_text = $${paramIndex}`);
      values.push(data.messageText);
      paramIndex++;
    }

    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      values.push(data.isActive);
      paramIndex++;
    }

    if (updates.length === 0) {
      throw new Error('Nenhum campo para atualizar');
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id, userId);

    const query = `
      UPDATE group_auto_messages
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
      RETURNING *
    `;

    const result = await pgPool.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('Mensagem automática não encontrada');
    }

    return this.mapRowToAutoMessage(result.rows[0]);
  }

  /**
   * Deletar mensagem automática
   */
  static async deleteAutoMessage(id: string, userId: string): Promise<void> {
    const query = `
      DELETE FROM group_auto_messages
      WHERE id = $1 AND user_id = $2
    `;

    const result = await pgPool.query(query, [id, userId]);

    if (result.rowCount === 0) {
      throw new Error('Mensagem automática não encontrada');
    }
  }

  /**
   * Processar e enviar mensagem automática
   */
  static async sendAutoMessage(
    instanceName: string,
    message: GroupAutoMessage,
    participantPhone: string,
    participantName?: string | null,
    groupName?: string | null
  ): Promise<void> {
    try {
      // Substituir variáveis no texto da mensagem
      let processedText = message.messageText;
      
      processedText = processedText.replace(/{name}/g, participantName || participantPhone);
      processedText = processedText.replace(/{phone}/g, participantPhone);
      processedText = processedText.replace(/{group}/g, groupName || 'o grupo');

      // Para envio via Evolution API, usar o número completo com código do país
      // O participantPhone já vem sem @s.whatsapp.net, mas pode precisar do código do país
      let phoneForSending = participantPhone;
      
      // Remover caracteres não numéricos
      phoneForSending = phoneForSending.replace(/\D/g, '');
      
      // Se o número não começar com 55 (código do Brasil), adicionar
      if (!phoneForSending.startsWith('55')) {
        // Se tiver 10 ou 11 dígitos (DDD + número), adicionar 55
        if (phoneForSending.length === 10 || phoneForSending.length === 11) {
          phoneForSending = `55${phoneForSending}`;
        }
      }

      // Enviar mensagem individual (não no grupo)
      await sendMessage(instanceName, {
        number: phoneForSending,
        text: processedText,
      });

      console.log(`✅ Mensagem automática ${message.messageType} enviada para ${participantPhone}`);
    } catch (error) {
      console.error(`❌ Erro ao enviar mensagem automática ${message.messageType}:`, error);
      // Não lançar erro para não bloquear o processamento do webhook
    }
  }

  /**
   * Mapeia uma row do PostgreSQL para o formato GroupAutoMessage
   */
  private static mapRowToAutoMessage(row: any): GroupAutoMessage {
    return {
      id: row.id,
      userId: row.user_id,
      instanceId: row.instance_id,
      groupId: row.group_id,
      isActive: row.is_active,
      messageType: row.message_type,
      messageText: row.message_text,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
