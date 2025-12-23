/**
 * Service para verificar conflitos de uso de instâncias entre Agentes de IA e Workflows
 */

import { pgPool } from '../config/databases';
import { AIAgentService } from './aiAgentService';
import { WorkflowService } from './workflowService';

/**
 * Verifica se uma instância está sendo usada por um Agente de IA ativo
 */
export async function isInstanceUsedByAIAgent(
  instanceId: string,
  userId: string,
  excludeAgentId?: string
): Promise<boolean> {
  let query = `
    SELECT COUNT(*) as count
    FROM ai_agents
    WHERE instance_id = $1 AND user_id = $2 AND is_active = true
  `;
  const params: any[] = [instanceId, userId];

  if (excludeAgentId) {
    query += ` AND id != $3`;
    params.push(excludeAgentId);
  }

  const result = await pgPool.query(query, params);
  return parseInt(result.rows[0].count) > 0;
}

/**
 * Verifica se uma instância está sendo usada por um Workflow com gatilho WhatsApp ativo
 */
export async function isInstanceUsedByWorkflow(
  instanceId: string,
  userId: string,
  excludeWorkflowId?: string
): Promise<boolean> {
  let query = `
    SELECT COUNT(*) as count
    FROM workflows
    WHERE user_id = $1 AND is_active = true
    AND (
      instance_id = $2
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(nodes) AS node
        WHERE (node->>'type') = 'whatsappTrigger'
        AND (node->'data'->>'instanceId') = $2
      )
    )
  `;
  const params: any[] = [userId, instanceId];

  if (excludeWorkflowId) {
    query = `
      SELECT COUNT(*) as count
      FROM workflows
      WHERE user_id = $1 AND is_active = true AND id != $3
      AND (
        instance_id = $2
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(nodes) AS node
          WHERE (node->>'type') = 'whatsappTrigger'
          AND (node->'data'->>'instanceId') = $2
        )
      )
    `;
    params.push(excludeWorkflowId);
  }

  const result = await pgPool.query(query, params);
  return parseInt(result.rows[0].count) > 0;
}

/**
 * Verifica se uma instância já está sendo usada em outro workflow com gatilho WhatsApp
 */
export async function isInstanceUsedInOtherWorkflowTrigger(
  instanceId: string,
  userId: string,
  excludeWorkflowId?: string
): Promise<{ isUsed: boolean; workflowName?: string }> {
  let query = `
    SELECT id, name
    FROM workflows
    WHERE user_id = $1 AND is_active = true
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(nodes) AS node
      WHERE (node->>'type') = 'whatsappTrigger'
      AND (node->'data'->>'instanceId') = $2
    )
  `;
  const params: any[] = [userId, instanceId];

  if (excludeWorkflowId) {
    query += ` AND id != $3`;
    params.push(excludeWorkflowId);
  }

  const result = await pgPool.query(query, params);
  
  if (result.rows.length > 0) {
    return {
      isUsed: true,
      workflowName: result.rows[0].name,
    };
  }

  return { isUsed: false };
}

/**
 * Obtém todas as instâncias em uso por Agentes de IA ativos
 */
export async function getInstancesUsedByAIAgents(userId: string): Promise<string[]> {
  const query = `
    SELECT DISTINCT instance_id
    FROM ai_agents
    WHERE user_id = $1 AND is_active = true
  `;
  
  const result = await pgPool.query(query, [userId]);
  return result.rows.map((row) => row.instance_id);
}

/**
 * Obtém todas as instâncias em uso por Workflows ativos (tanto instance_id quanto nos nós de gatilho)
 */
export async function getInstancesUsedByWorkflows(userId: string): Promise<string[]> {
  const query = `
    SELECT DISTINCT instance_id
    FROM workflows
    WHERE user_id = $1 AND is_active = true AND instance_id IS NOT NULL AND instance_id != ''
    UNION
    SELECT DISTINCT (node->'data'->>'instanceId') as instance_id
    FROM workflows,
         jsonb_array_elements(nodes) AS node
    WHERE user_id = $1
      AND is_active = true
      AND (node->>'type') = 'whatsappTrigger'
      AND (node->'data'->>'instanceId') IS NOT NULL
      AND (node->'data'->>'instanceId') != ''
  `;
  
  const result = await pgPool.query(query, [userId]);
  return result.rows
    .map((row) => row.instance_id)
    .filter((id): id is string => id !== null && id !== '');
}

