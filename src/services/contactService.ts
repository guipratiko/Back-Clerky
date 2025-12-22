/**
 * Service para gerenciamento de Contatos do CRM
 * Trabalha com PostgreSQL
 */

import { pgPool } from '../config/databases';

export interface Contact {
  id: string;
  userId: string;
  instanceId: string;
  remoteJid: string;
  phone: string;
  name: string;
  profilePicture: string | null;
  columnId: string | null;
  unreadCount: number;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  labels?: Array<{
    id: string;
    name: string;
    color: string;
    order: number;
  }>;
}

export interface CreateContactData {
  userId: string;
  instanceId: string;
  remoteJid: string;
  phone: string;
  name: string;
  profilePicture?: string | null;
  columnId: string | null;
}

export interface UpdateContactData {
  name?: string;
  profilePicture?: string | null;
  columnId?: string | null;
  unreadCount?: number;
}

export interface SearchContactsParams {
  userId: string;
  query?: string;
  instanceId?: string;
  columnId?: string;
}

export class ContactService {
  /**
   * Criar ou buscar contato existente
   */
  static async findOrCreate(data: CreateContactData): Promise<Contact> {
    // Tentar buscar existente
    const findQuery = `
      SELECT * FROM contacts
      WHERE user_id = $1 AND instance_id = $2 AND remote_jid = $3
    `;

    const findResult = await pgPool.query(findQuery, [
      data.userId,
      data.instanceId,
      data.remoteJid,
    ]);

    if (findResult.rows.length > 0) {
      return this.mapRowToContact(findResult.rows[0]);
    }

    // Criar novo contato
    const insertQuery = `
      INSERT INTO contacts (
        user_id, instance_id, remote_jid, phone, name,
        profile_picture, column_id, unread_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
      RETURNING *
    `;

    const insertResult = await pgPool.query(insertQuery, [
      data.userId,
      data.instanceId,
      data.remoteJid,
      data.phone,
      data.name,
      data.profilePicture || null,
      data.columnId,
    ]);

    return this.mapRowToContact(insertResult.rows[0]);
  }

  /**
   * Obter contato por remoteJid
   */
  static async getContactByRemoteJid(
    userId: string,
    instanceId: string,
    remoteJid: string
  ): Promise<Contact | null> {
    const query = `
      SELECT * FROM contacts
      WHERE user_id = $1 AND instance_id = $2 AND remote_jid = $3
    `;

    const result = await pgPool.query(query, [userId, instanceId, remoteJid]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToContact(result.rows[0]);
  }

  /**
   * Obter contato por ID
   */
  static async getContactById(id: string, userId: string): Promise<Contact | null> {
    const query = `
      SELECT * FROM contacts
      WHERE id = $1 AND user_id = $2
    `;

    const result = await pgPool.query(query, [id, userId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToContact(result.rows[0]);
  }

  /**
   * Obter todos os contatos de um usuário
   */
  static async getContactsByUserId(
    userId: string,
    instanceId?: string
  ): Promise<Contact[]> {
    let query = `
      SELECT * FROM contacts
      WHERE user_id = $1
    `;
    const params: any[] = [userId];

    if (instanceId) {
      query += ` AND instance_id = $2`;
      params.push(instanceId);
    }

    query += ` ORDER BY last_message_at DESC NULLS LAST, created_at DESC`;

    const result = await pgPool.query(query, params);
    return result.rows.map((row) => this.mapRowToContact(row));
  }

  /**
   * Buscar contatos (busca full-text)
   */
  static async searchContacts(params: SearchContactsParams): Promise<Contact[]> {
    let query = `
      SELECT * FROM contacts
      WHERE user_id = $1
    `;
    const queryParams: any[] = [params.userId];

    let paramIndex = 2;

    if (params.instanceId) {
      query += ` AND instance_id = $${paramIndex}`;
      queryParams.push(params.instanceId);
      paramIndex++;
    }

    if (params.columnId) {
      query += ` AND column_id = $${paramIndex}`;
      queryParams.push(params.columnId);
      paramIndex++;
    }

    if (params.query && params.query.trim().length > 0) {
      query += ` AND (
        to_tsvector('portuguese', COALESCE(name, '') || ' ' || COALESCE(phone, '')) 
        @@ plainto_tsquery('portuguese', $${paramIndex})
        OR name ILIKE $${paramIndex + 1}
        OR phone ILIKE $${paramIndex + 1}
      )`;
      const searchTerm = `%${params.query.trim()}%`;
      queryParams.push(params.query.trim());
      queryParams.push(searchTerm);
    }

    query += ` ORDER BY last_message_at DESC NULLS LAST, created_at DESC`;

    const result = await pgPool.query(query, queryParams);
    return result.rows.map((row) => this.mapRowToContact(row));
  }

  /**
   * Atualizar contato
   */
  static async updateContact(
    id: string,
    userId: string,
    data: UpdateContactData
  ): Promise<Contact> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      values.push(data.name.trim());
      paramIndex++;
    }

    if (data.profilePicture !== undefined) {
      updates.push(`profile_picture = $${paramIndex}`);
      values.push(data.profilePicture || null);
      paramIndex++;
    }

    if (data.columnId !== undefined) {
      updates.push(`column_id = $${paramIndex}`);
      values.push(data.columnId || null);
      paramIndex++;
    }

    if (data.unreadCount !== undefined) {
      updates.push(`unread_count = $${paramIndex}`);
      values.push(data.unreadCount);
      paramIndex++;
    }

    if (updates.length === 0) {
      throw new Error('Nenhum campo para atualizar');
    }

    values.push(id, userId);
    const query = `
      UPDATE contacts
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
      RETURNING *
    `;

    const result = await pgPool.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('Contato não encontrado');
    }

    return this.mapRowToContact(result.rows[0]);
  }

  /**
   * Mover contato para outra coluna
   * Aceita UUID ou short_id da coluna
   */
  static async moveContact(
    id: string,
    userId: string,
    columnId: string
  ): Promise<Contact> {
    // Importar aqui para evitar dependência circular
    const { CRMColumnService } = await import('./crmColumnService');
    
    // Buscar coluna por ID (aceita UUID ou short_id)
    const column = await CRMColumnService.getColumnById(columnId, userId);
    if (!column) {
      throw new Error('Coluna não encontrada');
    }
    
    // Usar o UUID da coluna para atualizar o contato
    return this.updateContact(id, userId, { columnId: column.id });
  }

  /**
   * Resetar contador de não lidas
   */
  static async resetUnreadCount(id: string, userId: string): Promise<Contact> {
    return this.updateContact(id, userId, { unreadCount: 0 });
  }

  /**
   * Obter contato com labels
   */
  static async getContactWithLabels(id: string, userId: string): Promise<Contact | null> {
    const contact = await this.getContactById(id, userId);
    if (!contact) {
      return null;
    }

    const { LabelService } = await import('./labelService');
    const labels = await LabelService.getLabelsByContactId(id);
    
    return {
      ...contact,
      labels: labels.map((label) => ({
        id: label.id,
        name: label.name,
        color: label.color,
        order: label.orderIndex,
      })),
    };
  }

  /**
   * Mapeia uma row do PostgreSQL para o formato Contact
   */
  private static mapRowToContact(row: any): Contact {
    return {
      id: row.id,
      userId: row.user_id,
      instanceId: row.instance_id,
      remoteJid: row.remote_jid,
      phone: row.phone,
      name: row.name,
      profilePicture: row.profile_picture,
      columnId: row.column_id,
      unreadCount: row.unread_count || 0,
      lastMessage: row.last_message,
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

