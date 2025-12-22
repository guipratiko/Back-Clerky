/**
 * Service para gerenciamento de Colunas do CRM
 * Trabalha com PostgreSQL
 */

import { pgPool } from '../config/databases';

interface CRMColumnRow {
  id: string;
  user_id: string;
  name: string;
  order_index: number;
  short_id: number;
  color: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CRMColumn {
  id: string;
  userId: string;
  name: string;
  orderIndex: number;
  shortId: number;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateColumnData {
  userId: string;
  name: string;
  orderIndex: number;
  color?: string;
}

export interface UpdateColumnData {
  name?: string;
  color?: string;
}

export class CRMColumnService {
  /**
   * Inicializa colunas padrão para um usuário
   */
  static async initializeColumns(userId: string): Promise<CRMColumn[]> {
    const defaultColumns = [
      { name: 'Novos', orderIndex: 0 },
      { name: 'Em Atendimento', orderIndex: 1 },
      { name: 'Aguardando', orderIndex: 2 },
      { name: 'Finalizados', orderIndex: 3 },
      { name: 'Arquivados', orderIndex: 4 },
    ];

    const columns: CRMColumn[] = [];

    for (const col of defaultColumns) {
      // Verificar se já existe
      const existingQuery = `
        SELECT * FROM crm_columns 
        WHERE user_id = $1 AND order_index = $2
      `;
      const existingResult = await pgPool.query(existingQuery, [userId, col.orderIndex]);

      if (existingResult.rows.length === 0) {
        // Criar coluna com short_id baseado no order_index (order_index + 1)
        const shortId = col.orderIndex + 1;
        const insertQuery = `
          INSERT INTO crm_columns (user_id, name, order_index, short_id, color)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `;
        const insertResult = await pgPool.query(insertQuery, [
          userId,
          col.name,
          col.orderIndex,
          shortId,
          null,
        ]);
        columns.push(this.mapRowToColumn(insertResult.rows[0]));
      } else {
        const existingColumn = this.mapRowToColumn(existingResult.rows[0]);
        // Garantir que short_id existe (para colunas antigas)
        if (!existingColumn.shortId) {
          const shortId = existingColumn.orderIndex + 1;
          const updateQuery = `
            UPDATE crm_columns
            SET short_id = $1
            WHERE id = $2
            RETURNING *
          `;
          const updateResult = await pgPool.query(updateQuery, [shortId, existingColumn.id]);
          columns.push(this.mapRowToColumn(updateResult.rows[0]));
        } else {
          columns.push(existingColumn);
        }
      }
    }

    return columns.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  /**
   * Obter todas as colunas de um usuário
   */
  static async getColumnsByUserId(userId: string): Promise<CRMColumn[]> {
    // Garantir que as colunas padrão existem
    await this.initializeColumns(userId);

    const query = `
      SELECT * FROM crm_columns
      WHERE user_id = $1
      ORDER BY order_index ASC
    `;

    const result = await pgPool.query(query, [userId]);
    return result.rows.map((row: CRMColumnRow) => this.mapRowToColumn(row));
  }

  /**
   * Obter uma coluna por ID (UUID ou short_id)
   */
  static async getColumnById(id: string, userId: string): Promise<CRMColumn | null> {
    // Verificar se é UUID (36 caracteres com hífens) ou short_id (número)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    let query: string;
    let params: any[];
    
    if (isUUID) {
      // Buscar por UUID
      query = `
        SELECT * FROM crm_columns
        WHERE id = $1 AND user_id = $2
      `;
      params = [id, userId];
    } else {
      // Buscar por short_id
      const shortId = parseInt(id, 10);
      if (isNaN(shortId)) {
        return null;
      }
      query = `
        SELECT * FROM crm_columns
        WHERE short_id = $1 AND user_id = $2
      `;
      params = [shortId, userId];
    }

    const result = await pgPool.query(query, params);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToColumn(result.rows[0]);
  }

  /**
   * Atualizar uma coluna
   */
  static async updateColumn(
    id: string,
    userId: string,
    data: UpdateColumnData
  ): Promise<CRMColumn> {
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
      values.push(data.color || null);
      paramIndex++;
    }

    if (updates.length === 0) {
      throw new Error('Nenhum campo para atualizar');
    }

    values.push(id, userId);
    const query = `
      UPDATE crm_columns
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
      RETURNING *
    `;

    const result = await pgPool.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('Coluna não encontrada');
    }

    return this.mapRowToColumn(result.rows[0]);
  }

  /**
   * Mapeia uma row do PostgreSQL para o formato CRMColumn
   */
  private static mapRowToColumn(row: CRMColumnRow): CRMColumn {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      orderIndex: row.order_index,
      shortId: row.short_id || row.order_index + 1, // Fallback para colunas antigas
      color: row.color,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

