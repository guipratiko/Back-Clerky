/**
 * Service para gerenciamento de Mensagens do Chat
 * Trabalha com PostgreSQL e Redis (cache)
 */

import { pgPool } from '../config/databases';
import { redisClient } from '../config/databases';

export interface Message {
  id: string;
  userId: string;
  instanceId: string;
  contactId: string;
  remoteJid: string;
  messageId: string;
  fromMe: boolean;
  messageType: string;
  content: string;
  mediaUrl: string | null;
  timestamp: Date;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMessageData {
  userId: string;
  instanceId: string;
  contactId: string;
  remoteJid: string;
  messageId: string;
  fromMe: boolean;
  messageType: string;
  content: string;
  mediaUrl?: string | null;
  timestamp: Date;
  read?: boolean;
}

export interface GetMessagesParams {
  contactId: string;
  userId: string;
  page?: number;
  limit?: number;
  useCache?: boolean;
}

// Constantes de cache
const MESSAGES_PER_PAGE = 50;
const CACHE_TTL_PAGE = 1800; // 30 minutos para páginas
const CACHE_TTL_RECENT = 3600; // 1 hora para mensagens recentes
const RECENT_MESSAGES_LIMIT = 100; // Últimas 100 mensagens

export class MessageService {
  /**
   * Obter mensagens com paginação e cache
   */
  static async getMessages(params: GetMessagesParams): Promise<{
    messages: Message[];
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    const { contactId, userId, page = 1, limit = MESSAGES_PER_PAGE, useCache = true } = params;

    const cacheKey = `chat:messages:${contactId}:page:${page}`;

    // Tentar buscar do cache primeiro
    if (useCache) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          const cachedData = JSON.parse(cached);
          console.log(`📦 Cache hit: ${cacheKey}`);
          return cachedData;
        }
      } catch (error) {
        console.error('Erro ao buscar cache:', error);
      }
    }

    // Calcular offset
    const offset = (page - 1) * limit;

    // Buscar do PostgreSQL
    const query = `
      SELECT 
        id, user_id, instance_id, contact_id, remote_jid,
        message_id, from_me, message_type, content, media_url,
        timestamp, read, created_at, updated_at
      FROM messages
      WHERE contact_id = $1
      ORDER BY timestamp DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pgPool.query(query, [contactId, limit, offset]);

    // Verificar se há mais páginas
    const countQuery = `
      SELECT COUNT(*) as total
      FROM messages
      WHERE contact_id = $1
    `;
    const countResult = await pgPool.query(countQuery, [contactId]);
    const total = parseInt(countResult.rows[0].total);
    const hasMore = offset + limit < total;

    // Reverter ordem (mais antigas primeiro, como WhatsApp)
    const messages = result.rows.reverse().map((row) => this.mapRowToMessage(row));

    const response = {
      messages,
      page,
      limit,
      hasMore,
    };

    // Salvar no cache
    if (useCache) {
      try {
        await redisClient.setex(cacheKey, CACHE_TTL_PAGE, JSON.stringify(response));
        console.log(`💾 Cache salvo: ${cacheKey}`);
      } catch (error) {
        console.error('Erro ao salvar cache:', error);
      }
    }

    return response;
  }

  /**
   * Obter mensagens recentes (últimas 100) - sempre do cache se possível
   */
  static async getRecentMessages(contactId: string, userId: string): Promise<Message[]> {
    const cacheKey = `chat:messages:${contactId}:recent`;

    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        console.log(`📦 Cache hit (recent): ${cacheKey}`);
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('Erro ao buscar cache recent:', error);
    }

    // Buscar últimas 100 do PostgreSQL
    const query = `
      SELECT 
        id, user_id, instance_id, contact_id, remote_jid,
        message_id, from_me, message_type, content, media_url,
        timestamp, read, created_at, updated_at
      FROM messages
      WHERE contact_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `;

    const result = await pgPool.query(query, [contactId, RECENT_MESSAGES_LIMIT]);
    const messages = result.rows.reverse().map((row) => this.mapRowToMessage(row));

    // Salvar no cache (TTL maior para mensagens recentes)
    try {
      await redisClient.setex(cacheKey, CACHE_TTL_RECENT, JSON.stringify(messages));
      console.log(`💾 Cache salvo (recent): ${cacheKey}`);
    } catch (error) {
      console.error('Erro ao salvar cache recent:', error);
    }

    return messages;
  }

  /**
   * Criar nova mensagem
   */
  static async createMessage(data: CreateMessageData): Promise<Message> {
    const query = `
      INSERT INTO messages (
        user_id, instance_id, contact_id, remote_jid,
        message_id, from_me, message_type, content,
        media_url, timestamp, read
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (message_id, instance_id) DO NOTHING
      RETURNING *
    `;

    try {
      const result = await pgPool.query(query, [
        data.userId,
        data.instanceId,
        data.contactId,
        data.remoteJid,
        data.messageId,
        data.fromMe,
        data.messageType,
        data.content,
        data.mediaUrl || null,
        data.timestamp,
        data.read !== undefined ? data.read : data.fromMe, // Mensagens enviadas já são lidas
      ]);

      if (result.rows.length === 0) {
        // Mensagem já existe (conflito), buscar existente
        console.log(`⚠️ Mensagem já existe (messageId: ${data.messageId}, instanceId: ${data.instanceId}), buscando existente...`);
        const existingQuery = `
          SELECT * FROM messages
          WHERE message_id = $1 AND instance_id = $2
        `;
        const existingResult = await pgPool.query(existingQuery, [data.messageId, data.instanceId]);
        if (existingResult.rows.length > 0) {
          return this.mapRowToMessage(existingResult.rows[0]);
        }
        throw new Error('Erro ao criar mensagem: mensagem não encontrada após conflito');
      }

      const message = this.mapRowToMessage(result.rows[0]);
      console.log(`💾 Mensagem salva no PostgreSQL: ID=${message.id}, messageId=${message.messageId}`);

      // Invalidar cache
      await this.invalidateCache(data.contactId);

      return message;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error('❌ Erro ao salvar mensagem no PostgreSQL:', errorMessage);
      if (error && typeof error === 'object' && 'code' in error) {
        console.error(`   Código PostgreSQL: ${(error as { code: string }).code}`);
      }
      throw error;
    }
  }

  /**
   * Marcar mensagens como lidas
   */
  static async markAsRead(contactId: string, userId: string): Promise<number> {
    const query = `
      UPDATE messages
      SET read = TRUE, updated_at = NOW()
      WHERE contact_id = $1 
        AND user_id = $2 
        AND read = FALSE 
        AND from_me = FALSE
      RETURNING id
    `;

    const result = await pgPool.query(query, [contactId, userId]);
    const count = result.rows.length;

    // Invalidar cache para refletir mudanças
    await this.invalidateCache(contactId);

    return count;
  }

  /**
   * Invalidar cache de mensagens de um contato
   */
  static async invalidateCache(contactId: string): Promise<void> {
    const patterns = [
      `chat:messages:${contactId}:page:*`,
      `chat:messages:${contactId}:recent`,
    ];

    for (const pattern of patterns) {
      try {
        // Redis não tem keys() direto no ioredis, usar scan
        const stream = redisClient.scanStream({
          match: pattern,
          count: 100,
        });

        const keys: string[] = [];
        stream.on('data', (resultKeys: string[]) => {
          keys.push(...resultKeys);
        });

        await new Promise<void>((resolve, reject) => {
          stream.on('end', async () => {
            try {
              if (keys.length > 0) {
                await redisClient.del(...keys);
                console.log(`🗑️ Cache invalidado: ${keys.length} chave(s) removida(s)`);
              }
              resolve();
            } catch (error) {
              reject(error);
            }
          });
          stream.on('error', reject);
        });
      } catch (error) {
        console.error('Erro ao invalidar cache:', error);
        // Não falhar se cache não funcionar
      }
    }
  }

  /**
   * Obter contagem total de mensagens de um contato
   */
  static async getMessageCount(contactId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) as total
      FROM messages
      WHERE contact_id = $1
    `;

    const result = await pgPool.query(query, [contactId]);
    return parseInt(result.rows[0].total);
  }

  /**
   * Mapeia uma row do PostgreSQL para o formato Message
   */
  private static mapRowToMessage(row: any): Message {
    return {
      id: row.id,
      userId: row.user_id,
      instanceId: row.instance_id,
      contactId: row.contact_id,
      remoteJid: row.remote_jid,
      messageId: row.message_id,
      fromMe: row.from_me,
      messageType: row.message_type,
      content: row.content,
      mediaUrl: row.media_url,
      timestamp: row.timestamp,
      read: row.read,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

