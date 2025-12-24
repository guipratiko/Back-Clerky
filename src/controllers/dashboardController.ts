/**
 * Controller para Dashboard - Estatísticas e dados resumidos
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import Instance from '../models/Instance';
import { ContactService } from '../services/contactService';
import { MessageService } from '../services/messageService';
import { DispatchService } from '../services/dispatchService';
import { WorkflowService } from '../services/workflowService';
import { AIAgentService } from '../services/aiAgentService';
import { pgPool } from '../config/databases';
import {
  createValidationError,
  handleControllerError,
} from '../utils/errorHelpers';

/**
 * Obter estatísticas do dashboard
 * GET /api/dashboard/stats
 */
export const getDashboardStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    // Buscar estatísticas em paralelo
    const [instances, contactsCount, dispatches, workflows, aiAgents, contactsByColumn, recentMessages, recentContacts, groupsCount] = await Promise.all([
      // Instâncias
      Instance.find({ userId }).lean(),

      // Total de contatos
      pgPool.query(
        'SELECT COUNT(*) as count FROM contacts WHERE user_id = $1',
        [userId]
      ),

      // Disparos
      DispatchService.getByUserId(userId),

      // Workflows
      WorkflowService.getWorkflowsByUserId(userId),

      // Agentes IA
      AIAgentService.getByUserId(userId),

      // Contatos por coluna (com nome da coluna)
      pgPool.query(
        `SELECT c.column_id, COALESCE(col.name, 'Sem coluna') as column_name, COUNT(*) as count 
         FROM contacts c 
         LEFT JOIN crm_columns col ON c.column_id = col.id AND col.user_id = $1
         WHERE c.user_id = $1 
         GROUP BY c.column_id, col.name`,
        [userId]
      ),

      // Últimas mensagens (últimas 10)
      pgPool.query(
        `SELECT m.*, c.name as contact_name, c.phone as contact_phone
         FROM messages m
         JOIN contacts c ON m.contact_id = c.id
         WHERE m.user_id = $1 AND m.from_me = false
         ORDER BY m.timestamp DESC
         LIMIT 10`,
        [userId]
      ),

      // Últimos contatos adicionados (últimos 10)
      pgPool.query(
        `SELECT id, name, phone, created_at
         FROM contacts
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [userId]
      ),

      // Total de grupos (será calculado dinamicamente, pois não há tabela de grupos)
      Promise.resolve({ rows: [{ count: 0 }] }),
    ]);

    // Processar instâncias
    const instancesStats = {
      total: instances.length,
      connected: instances.filter((i) => i.status === 'connected').length,
      disconnected: instances.filter((i) => i.status === 'disconnected').length,
      connecting: instances.filter((i) => i.status === 'connecting').length,
      error: instances.filter((i) => i.status === 'error').length,
    };

    // Processar disparos
    const dispatchesStats = {
      total: dispatches.length,
      pending: dispatches.filter((d) => d.status === 'pending').length,
      running: dispatches.filter((d) => d.status === 'running').length,
      completed: dispatches.filter((d) => d.status === 'completed').length,
      failed: dispatches.filter((d) => d.status === 'failed').length,
      paused: dispatches.filter((d) => d.status === 'paused').length,
    };

    // Processar contatos por coluna
    const contactsByColumnData = contactsByColumn.rows.map((row: any) => ({
      columnId: row.column_id,
      columnName: row.column_name || 'Sem coluna',
      count: parseInt(row.count),
    }));

    // Processar mensagens recentes
    const recentMessagesData = recentMessages.rows.map((row: any) => ({
      id: row.id,
      contactId: row.contact_id,
      contactName: row.contact_name || row.contact_phone,
      contactPhone: row.contact_phone,
      content: row.content,
      messageType: row.message_type,
      timestamp: row.timestamp,
    }));

    // Processar contatos recentes
    const recentContactsData = recentContacts.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      createdAt: row.created_at,
    }));

    // Últimos disparos (ordenados por data de criação)
    const recentDispatches = dispatches
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10)
      .map((d) => ({
        id: d.id,
        name: d.name,
        status: d.status,
        stats: d.stats,
        createdAt: d.createdAt.toISOString(),
      }));

    res.status(200).json({
      status: 'success',
      stats: {
        instances: instancesStats,
        contacts: {
          total: parseInt(contactsCount.rows[0].count),
          byColumn: contactsByColumnData,
        },
        dispatches: dispatchesStats,
        workflows: {
          total: workflows.length,
        },
        groups: {
          total: typeof groupsCount.rows[0].count === 'number'
            ? groupsCount.rows[0].count
            : parseInt(groupsCount.rows[0].count as string, 10),
        },
        aiAgents: {
          total: aiAgents.length,
          active: aiAgents.filter((a) => a.isActive).length,
        },
      },
      recent: {
        messages: recentMessagesData,
        contacts: recentContactsData,
        dispatches: recentDispatches,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao obter estatísticas do dashboard'));
  }
};

