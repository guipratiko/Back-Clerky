/**
 * Service para gerenciar movimentações de grupos (entradas, saídas, promoções)
 * Trabalha com PostgreSQL
 */

import { pgPool } from '../config/databases';

export interface GroupMovement {
  id: string;
  userId: string;
  instanceId: string;
  groupId: string;
  groupName: string | null;
  participantId: string;
  participantPhone: string | null;
  participantName: string | null;
  movementType: 'join' | 'leave' | 'promote' | 'demote';
  isAdmin: boolean;
  actionBy: string | null;
  actionByPhone: string | null;
  actionByName: string | null;
  createdAt: Date;
}

export interface CreateGroupMovementData {
  userId: string;
  instanceId: string;
  groupId: string;
  groupName?: string | null;
  participantId: string;
  participantPhone?: string | null;
  participantName?: string | null;
  movementType: 'join' | 'leave' | 'promote' | 'demote';
  isAdmin?: boolean;
  actionBy?: string | null;
  actionByPhone?: string | null;
  actionByName?: string | null;
}

export interface GetGroupMovementsParams {
  userId: string;
  instanceId?: string;
  groupId?: string;
  participantId?: string;
  movementType?: 'join' | 'leave' | 'promote' | 'demote';
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export class GroupMovementService {
  /**
   * Criar registro de movimentação
   */
  static async createMovement(data: CreateGroupMovementData): Promise<GroupMovement> {
    const query = `
      INSERT INTO group_movements (
        user_id, instance_id, group_id, group_name,
        participant_id, participant_phone, participant_name,
        movement_type, is_admin, action_by, action_by_phone, action_by_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const result = await pgPool.query(query, [
      data.userId,
      data.instanceId,
      data.groupId,
      data.groupName || null,
      data.participantId,
      data.participantPhone || null,
      data.participantName || null,
      data.movementType,
      data.isAdmin !== undefined ? data.isAdmin : false,
      data.actionBy || null,
      data.actionByPhone || null,
      data.actionByName || null,
    ]);

    return this.mapRowToMovement(result.rows[0]);
  }

  /**
   * Obter movimentações com filtros e paginação
   */
  static async getMovements(params: GetGroupMovementsParams): Promise<{
    movements: GroupMovement[];
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  }> {
    const {
      userId,
      instanceId,
      groupId,
      participantId,
      movementType,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = params;

    const offset = (page - 1) * limit;

    // Construir query com filtros dinâmicos
    let whereConditions = ['user_id = $1'];
    const queryParams: any[] = [userId];
    let paramIndex = 2;

    if (instanceId) {
      whereConditions.push(`instance_id = $${paramIndex}`);
      queryParams.push(instanceId);
      paramIndex++;
    }

    if (groupId) {
      whereConditions.push(`group_id = $${paramIndex}`);
      queryParams.push(groupId);
      paramIndex++;
    }

    if (participantId) {
      whereConditions.push(`participant_id = $${paramIndex}`);
      queryParams.push(participantId);
      paramIndex++;
    }

    if (movementType) {
      whereConditions.push(`movement_type = $${paramIndex}`);
      queryParams.push(movementType);
      paramIndex++;
    }

    if (startDate) {
      whereConditions.push(`created_at >= $${paramIndex}`);
      queryParams.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereConditions.push(`created_at <= $${paramIndex}`);
      queryParams.push(endDate);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Query para contar total
    const countQuery = `SELECT COUNT(*) as total FROM group_movements WHERE ${whereClause}`;
    const countResult = await pgPool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Query para buscar movimentações
    const query = `
      SELECT * FROM group_movements
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(limit, offset);
    const result = await pgPool.query(query, queryParams);

    const movements = result.rows.map((row) => this.mapRowToMovement(row));

    return {
      movements,
      page,
      limit,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Obter estatísticas de movimentações
   */
  static async getStatistics(
    userId: string,
    instanceId?: string,
    groupId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalJoins: number;
    totalLeaves: number;
    totalPromotes: number;
    totalDemotes: number;
    uniqueParticipants: number;
    uniqueGroups: number;
  }> {
    let whereConditions = ['user_id = $1'];
    const queryParams: any[] = [userId];
    let paramIndex = 2;

    if (instanceId) {
      whereConditions.push(`instance_id = $${paramIndex}`);
      queryParams.push(instanceId);
      paramIndex++;
    }

    if (groupId) {
      whereConditions.push(`group_id = $${paramIndex}`);
      queryParams.push(groupId);
      paramIndex++;
    }

    if (startDate) {
      whereConditions.push(`created_at >= $${paramIndex}`);
      queryParams.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereConditions.push(`created_at <= $${paramIndex}`);
      queryParams.push(endDate);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT 
        COUNT(*) FILTER (WHERE movement_type = 'join') as total_joins,
        COUNT(*) FILTER (WHERE movement_type = 'leave') as total_leaves,
        COUNT(*) FILTER (WHERE movement_type = 'promote') as total_promotes,
        COUNT(*) FILTER (WHERE movement_type = 'demote') as total_demotes,
        COUNT(DISTINCT participant_id) as unique_participants,
        COUNT(DISTINCT group_id) as unique_groups
      FROM group_movements
      WHERE ${whereClause}
    `;

    const result = await pgPool.query(query, queryParams);
    const row = result.rows[0];

    return {
      totalJoins: parseInt(row.total_joins) || 0,
      totalLeaves: parseInt(row.total_leaves) || 0,
      totalPromotes: parseInt(row.total_promotes) || 0,
      totalDemotes: parseInt(row.total_demotes) || 0,
      uniqueParticipants: parseInt(row.unique_participants) || 0,
      uniqueGroups: parseInt(row.unique_groups) || 0,
    };
  }

  /**
   * Mapeia uma row do PostgreSQL para o formato GroupMovement
   */
  private static mapRowToMovement(row: any): GroupMovement {
    return {
      id: row.id,
      userId: row.user_id,
      instanceId: row.instance_id,
      groupId: row.group_id,
      groupName: row.group_name,
      participantId: row.participant_id,
      participantPhone: row.participant_phone,
      participantName: row.participant_name,
      movementType: row.movement_type,
      isAdmin: row.is_admin,
      actionBy: row.action_by,
      actionByPhone: row.action_by_phone,
      actionByName: row.action_by_name,
      createdAt: row.created_at,
    };
  }
}
