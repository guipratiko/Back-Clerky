/**
 * Service para gerenciar mensagens automáticas de grupos (boas-vindas e despedida)
 * Trabalha com PostgreSQL
 */

import { pgPool } from '../config/databases';
import { sendMessage } from '../utils/evolutionAPI';
import { normalizePhone } from '../utils/numberNormalizer';

export interface GroupAutoMessage {
  id: string;
  userId: string;
  instanceId: string;
  groupId: string | null; // NULL = aplicar a todos os grupos
  isActive: boolean;
  messageType: 'welcome' | 'goodbye';
  messageText: string;
  delaySeconds: number;
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
  delaySeconds?: number;
}

export interface UpdateGroupAutoMessageData {
  messageText?: string;
  isActive?: boolean;
  delaySeconds?: number;
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
        delaySeconds: data.delaySeconds !== undefined ? data.delaySeconds : 0,
      });
    }

    // Criar novo
    const query = `
      INSERT INTO group_auto_messages (
        user_id, instance_id, group_id, message_type, message_text, is_active, delay_seconds
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
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
        data.delaySeconds !== undefined ? data.delaySeconds : 0,
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
        AND message_type = $3
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

    if (data.delaySeconds !== undefined) {
      updates.push(`delay_seconds = $${paramIndex}`);
      values.push(data.delaySeconds);
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
    // Declarar phoneForSending no escopo da função para estar disponível no catch
    let phoneForSending: string = participantPhone.replace(/\D/g, '');
    
    try {
      // Aplicar delay se configurado
      if (message.delaySeconds > 0) {
        console.log(`⏳ Aguardando ${message.delaySeconds} segundo(s) antes de enviar mensagem automática...`);
        await new Promise((resolve) => setTimeout(resolve, message.delaySeconds * 1000));
      }

      // Extrair primeiro nome (primeira palavra do nome)
      const firstName = participantName
        ? participantName.trim().split(/\s+/)[0]
        : participantPhone;

      // Substituir variáveis no texto da mensagem
      let processedText = message.messageText;
      
      processedText = processedText.replace(/{name}/g, participantName || participantPhone);
      processedText = processedText.replace(/{firstName}/g, firstName);
      processedText = processedText.replace(/{phone}/g, participantPhone);
      processedText = processedText.replace(/{group}/g, groupName || 'o grupo');

      // Normalizar número de telefone para envio via Evolution API
      // O participantPhone já vem sem @s.whatsapp.net do webhook
      const normalizedPhone = normalizePhone(participantPhone, '55');
      
      // Se conseguiu normalizar, usar o número normalizado
      if (normalizedPhone) {
        phoneForSending = normalizedPhone;
      } else {
        // Se não conseguiu normalizar, usar o número original limpo (pode ser de outro país)
        phoneForSending = participantPhone.replace(/\D/g, '');
        console.warn(`⚠️ Não foi possível normalizar o número ${participantPhone}, usando como está: ${phoneForSending}`);
      }
      

      // Enviar mensagem individual (não no grupo)
      await sendMessage(instanceName, {
        number: phoneForSending,
        text: processedText,
      });

      console.log(`✅ Mensagem automática ${message.messageType} enviada para ${participantPhone} (${phoneForSending})`);
    } catch (error: any) {
      // Verificar se o erro é porque o número não existe no WhatsApp
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('exists') && errorMessage.includes('false')) {
        console.warn(`⚠️ Número ${participantPhone} (${phoneForSending}) não existe no WhatsApp. Mensagem automática não enviada.`);
      } else {
        console.error(`❌ Erro ao enviar mensagem automática ${message.messageType} para ${participantPhone} (${phoneForSending}):`, errorMessage);
      }
      // Não lançar erro para não bloquear o processamento do webhook
    }
  }

  /**
   * Substituir mensagens automáticas de grupos específicos pelas mensagens globais
   */
  static async replaceGroupAutoMessages(
    userId: string,
    instanceId: string
  ): Promise<{ replaced: number }> {
    // Buscar mensagens globais (groupId IS NULL)
    const globalMessages = await this.getAutoMessagesByInstance(userId, instanceId);
    const globalWelcome = globalMessages.find((msg) => msg.messageType === 'welcome' && msg.groupId === null);
    const globalGoodbye = globalMessages.find((msg) => msg.messageType === 'goodbye' && msg.groupId === null);

    let replacedCount = 0;

    // Se existe mensagem global de boas-vindas, substituir todas as de grupos específicos
    if (globalWelcome) {
      const updateQuery = `
        UPDATE group_auto_messages
        SET message_text = $1,
            is_active = $2,
            delay_seconds = $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $4
          AND instance_id = $5
          AND message_type = 'welcome'
          AND group_id IS NOT NULL
      `;
      
      const result = await pgPool.query(updateQuery, [
        globalWelcome.messageText,
        globalWelcome.isActive,
        globalWelcome.delaySeconds,
        userId,
        instanceId,
      ]);
      
      replacedCount += result.rowCount || 0;
    }

    // Se existe mensagem global de despedida, substituir todas as de grupos específicos
    if (globalGoodbye) {
      const updateQuery = `
        UPDATE group_auto_messages
        SET message_text = $1,
            is_active = $2,
            delay_seconds = $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $4
          AND instance_id = $5
          AND message_type = 'goodbye'
          AND group_id IS NOT NULL
      `;
      
      const result = await pgPool.query(updateQuery, [
        globalGoodbye.messageText,
        globalGoodbye.isActive,
        globalGoodbye.delaySeconds,
        userId,
        instanceId,
      ]);
      
      replacedCount += result.rowCount || 0;
    }

    return { replaced: replacedCount };
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
      delaySeconds: row.delay_seconds || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
