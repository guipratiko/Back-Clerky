/**
 * Service para gerenciamento de Labels (Etiquetas) do CRM
 * Trabalha com PostgreSQL
 */

import { pgPool } from '../config/databases';

export interface Label {
  id: string;
  userId: string;
  name: string;
  color: string;
  orderIndex: number;
  shortId?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLabelData {
  userId: string;
  name: string;
  color: string;
  orderIndex: number;
}

export interface UpdateLabelData {
  name?: string;
  color?: string;
}

export class LabelService {
  /**
   * Inicializar labels padrão para um usuário (5 labels com cores vibrantes)
   */
  static async initializeLabels(userId: string): Promise<Label[]> {
    // Verificar se já existem labels
    const existingLabels = await this.getLabelsByUserId(userId);
    if (existingLabels.length > 0) {
      return existingLabels;
    }

    // Cores vibrantes padrão
    const defaultLabels = [
      { name: 'Urgente', color: '#EF4444', orderIndex: 0 }, // Vermelho
      { name: 'Importante', color: '#F59E0B', orderIndex: 1 }, // Laranja
      { name: 'Cliente VIP', color: '#8B5CF6', orderIndex: 2 }, // Roxo
      { name: 'Follow-up', color: '#10B981', orderIndex: 3 }, // Verde
      { name: 'Prospecção', color: '#3B82F6', orderIndex: 4 }, // Azul
    ];

    const createdLabels: Label[] = [];

    for (const labelData of defaultLabels) {
      const query = `
        INSERT INTO labels (user_id, name, color, order_index, short_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;

      const result = await pgPool.query(query, [
        userId,
        labelData.name,
        labelData.color,
        labelData.orderIndex,
        labelData.orderIndex + 1, // short_id = order_index + 1
      ]);

      createdLabels.push(this.mapRowToLabel(result.rows[0]));
    }

    return createdLabels;
  }

  /**
   * Obter todas as labels de um usuário
   */
  static async getLabelsByUserId(userId: string): Promise<Label[]> {
    const query = `
      SELECT * FROM labels
      WHERE user_id = $1
      ORDER BY order_index ASC
    `;

    const result = await pgPool.query(query, [userId]);
    return result.rows.map((row) => this.mapRowToLabel(row));
  }

  /**
   * Obter label por ID (aceita UUID ou short_id)
   */
  static async getLabelById(idOrShortId: string | number, userId: string): Promise<Label | null> {
    let query = `
      SELECT * FROM labels
      WHERE user_id = $1 AND 
    `;
    const params: any[] = [userId];

    if (typeof idOrShortId === 'number' || (typeof idOrShortId === 'string' && !isNaN(Number(idOrShortId)) && idOrShortId.length < 6)) {
      query += `short_id = $2`;
      params.push(Number(idOrShortId));
    } else {
      query += `id = $2`;
      params.push(idOrShortId);
    }

    const result = await pgPool.query(query, params);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToLabel(result.rows[0]);
  }

  /**
   * Atualizar label
   */
  static async updateLabel(
    id: string,
    userId: string,
    data: UpdateLabelData
  ): Promise<Label> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      values.push(data.name.trim());
      paramIndex++;
    }

    if (data.color !== undefined) {
      updates.push(`color = $${paramIndex}`);
      values.push(data.color);
      paramIndex++;
    }

    if (updates.length === 0) {
      throw new Error('Nenhum campo para atualizar');
    }

    values.push(id, userId);
    const query = `
      UPDATE labels
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
      RETURNING *
    `;

    const result = await pgPool.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('Label não encontrada');
    }

    return this.mapRowToLabel(result.rows[0]);
  }

  /**
   * Obter labels de um contato
   */
  static async getLabelsByContactId(contactId: string): Promise<Label[]> {
    const query = `
      SELECT l.* FROM labels l
      INNER JOIN contact_labels cl ON l.id = cl.label_id
      WHERE cl.contact_id = $1
      ORDER BY l.order_index ASC
    `;

    const result = await pgPool.query(query, [contactId]);
    return result.rows.map((row) => this.mapRowToLabel(row));
  }

  /**
   * Adicionar label a um contato
   */
  static async addLabelToContact(contactId: string, labelId: string): Promise<void> {
    const query = `
      INSERT INTO contact_labels (contact_id, label_id)
      VALUES ($1, $2)
      ON CONFLICT (contact_id, label_id) DO NOTHING
    `;

    await pgPool.query(query, [contactId, labelId]);
  }

  /**
   * Remover label de um contato
   */
  static async removeLabelFromContact(contactId: string, labelId: string): Promise<void> {
    const query = `
      DELETE FROM contact_labels
      WHERE contact_id = $1 AND label_id = $2
    `;

    await pgPool.query(query, [contactId, labelId]);
  }

  /**
   * Atualizar labels de um contato (substitui todas as labels)
   */
  static async updateContactLabels(contactId: string, labelIds: string[]): Promise<void> {
    // Remover todas as labels atuais
    const deleteQuery = `
      DELETE FROM contact_labels
      WHERE contact_id = $1
    `;
    await pgPool.query(deleteQuery, [contactId]);

    // Adicionar novas labels
    if (labelIds.length > 0) {
      const insertQuery = `
        INSERT INTO contact_labels (contact_id, label_id)
        VALUES ${labelIds.map((_, index) => `($1, $${index + 2})`).join(', ')}
        ON CONFLICT (contact_id, label_id) DO NOTHING
      `;
      await pgPool.query(insertQuery, [contactId, ...labelIds]);
    }
  }

  /**
   * Mapeia uma row do PostgreSQL para o formato Label
   */
  private static mapRowToLabel(row: any): Label {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      color: row.color,
      orderIndex: row.order_index,
      shortId: row.short_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

