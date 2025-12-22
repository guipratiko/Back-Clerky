/**
 * Service para gerenciamento de Workflows (MindClerky)
 * Trabalha com PostgreSQL
 */

import { pgPool } from '../config/databases';

export interface WorkflowNode {
  id: string;
  type: 'whatsappTrigger' | 'typebotTrigger' | 'condition' | 'delay' | 'end' | 'response' | 'spreadsheet';
  position: { x: number; y: number };
  data: {
    instanceId?: string; // Para trigger
    webhookUrl?: string; // Para typebotTrigger
    workflowId?: string; // Para typebotTrigger
    spreadsheetId?: string; // Para spreadsheet
    spreadsheetName?: string; // Para spreadsheet
    isAuthenticated?: boolean; // Para spreadsheet
    sheetName?: string; // Para spreadsheet
    conditions?: Array<{ id: string; text: string; outputId: string }>; // Para condition
    delay?: number; // Para delay
    delayUnit?: 'seconds' | 'minutes' | 'hours'; // Para delay
    responseType?: 'text' | 'image' | 'image_caption' | 'video' | 'video_caption' | 'audio' | 'file'; // Para response
    content?: string; // Para response (texto)
    mediaUrl?: string; // Para response (mídia)
    caption?: string; // Para response (legenda)
    fileName?: string; // Para response (arquivo)
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string; // Para condições com múltiplas saídas
}

export interface Workflow {
  id: string;
  userId: string;
  name: string;
  instanceId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWorkflowData {
  userId: string;
  name: string;
  instanceId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  isActive?: boolean;
}

export interface UpdateWorkflowData {
  name?: string;
  instanceId?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  isActive?: boolean;
}

export interface WorkflowContact {
  id: string;
  workflowId: string;
  contactPhone: string;
  instanceId: string;
  enteredAt: Date;
}

export class WorkflowService {
  /**
   * Mapear row do banco para objeto Workflow
   */
  private static mapRowToWorkflow(row: any): Workflow {
    // Parsear nodes e edges se forem strings JSON
    let nodes = row.nodes || [];
    let edges = row.edges || [];

    // Se nodes é uma string, fazer parse
    if (typeof nodes === 'string') {
      try {
        nodes = JSON.parse(nodes);
      } catch (e) {
        console.error('Erro ao fazer parse de nodes:', e);
        nodes = [];
      }
    }

    // Se edges é uma string, fazer parse
    if (typeof edges === 'string') {
      try {
        edges = JSON.parse(edges);
      } catch (e) {
        console.error('Erro ao fazer parse de edges:', e);
        edges = [];
      }
    }

    // Garantir que são arrays
    if (!Array.isArray(nodes)) {
      console.warn(`⚠️ Nodes não é um array para workflow ${row.id}:`, typeof nodes, nodes);
      nodes = [];
    }

    if (!Array.isArray(edges)) {
      console.warn(`⚠️ Edges não é um array para workflow ${row.id}:`, typeof edges, edges);
      edges = [];
    }

    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      instanceId: row.instance_id,
      nodes,
      edges,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Mapear row do banco para objeto WorkflowContact
   */
  private static mapRowToWorkflowContact(row: any): WorkflowContact {
    return {
      id: row.id,
      workflowId: row.workflow_id,
      contactPhone: row.contact_phone,
      instanceId: row.instance_id,
      enteredAt: row.entered_at,
    };
  }

  /**
   * Criar novo workflow
   */
  static async createWorkflow(data: CreateWorkflowData): Promise<Workflow> {
    const query = `
      INSERT INTO workflows (user_id, name, instance_id, nodes, edges, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await pgPool.query(query, [
      data.userId,
      data.name,
      data.instanceId,
      JSON.stringify(data.nodes),
      JSON.stringify(data.edges),
      data.isActive ?? true,
    ]);

    return this.mapRowToWorkflow(result.rows[0]);
  }

  /**
   * Obter todos os workflows de um usuário
   */
  static async getWorkflowsByUserId(userId: string): Promise<Workflow[]> {
    const query = `
      SELECT * FROM workflows
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;

    const result = await pgPool.query(query, [userId]);
    return result.rows.map((row) => this.mapRowToWorkflow(row));
  }

  /**
   * Obter todos os workflows ativos (para webhooks públicos)
   */
  static async getAllActiveWorkflows(): Promise<Workflow[]> {
    const query = `
      SELECT * FROM workflows
      WHERE is_active = true
      ORDER BY created_at DESC
    `;

    const result = await pgPool.query(query);
    return result.rows.map((row) => this.mapRowToWorkflow(row));
  }

  /**
   * Obter todos os workflows (incluindo inativos) - apenas para debug
   */
  static async getAllWorkflowsForDebug(): Promise<Workflow[]> {
    const query = `
      SELECT * FROM workflows
      ORDER BY created_at DESC
    `;

    const result = await pgPool.query(query);
    return result.rows.map((row) => this.mapRowToWorkflow(row));
  }

  /**
   * Obter workflow por ID
   */
  static async getWorkflowById(id: string, userId: string): Promise<Workflow | null> {
    const query = `
      SELECT * FROM workflows
      WHERE id = $1 AND user_id = $2
    `;

    const result = await pgPool.query(query, [id, userId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToWorkflow(result.rows[0]);
  }

  /**
   * Atualizar workflow
   */
  static async updateWorkflow(
    id: string,
    userId: string,
    data: UpdateWorkflowData
  ): Promise<Workflow | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }

    if (data.instanceId !== undefined) {
      updates.push(`instance_id = $${paramIndex++}`);
      values.push(data.instanceId);
    }

    if (data.nodes !== undefined) {
      updates.push(`nodes = $${paramIndex++}`);
      values.push(JSON.stringify(data.nodes));
    }

    if (data.edges !== undefined) {
      updates.push(`edges = $${paramIndex++}`);
      values.push(JSON.stringify(data.edges));
    }

    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(data.isActive);
    }

    if (updates.length === 0) {
      return this.getWorkflowById(id, userId);
    }

    values.push(id, userId);
    const query = `
      UPDATE workflows
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
      RETURNING *
    `;

    const result = await pgPool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToWorkflow(result.rows[0]);
  }

  /**
   * Deletar workflow
   */
  static async deleteWorkflow(id: string, userId: string): Promise<boolean> {
    const query = `
      DELETE FROM workflows
      WHERE id = $1 AND user_id = $2
    `;

    const result = await pgPool.query(query, [id, userId]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Adicionar contato à lista de contatos que entraram no workflow
   */
  static async addWorkflowContact(
    workflowId: string,
    contactPhone: string,
    instanceId: string
  ): Promise<WorkflowContact> {
    const query = `
      INSERT INTO workflow_contacts (workflow_id, contact_phone, instance_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (workflow_id, contact_phone, instance_id) DO NOTHING
      RETURNING *
    `;

    const result = await pgPool.query(query, [workflowId, contactPhone, instanceId]);

    if (result.rows.length === 0) {
      // Já existe, buscar o existente
      const findQuery = `
        SELECT * FROM workflow_contacts
        WHERE workflow_id = $1 AND contact_phone = $2 AND instance_id = $3
      `;
      const findResult = await pgPool.query(findQuery, [workflowId, contactPhone, instanceId]);
      return this.mapRowToWorkflowContact(findResult.rows[0]);
    }

    return this.mapRowToWorkflowContact(result.rows[0]);
  }

  /**
   * Verificar se contato já entrou no workflow
   */
  static async hasContactEntered(
    workflowId: string,
    contactPhone: string,
    instanceId: string
  ): Promise<boolean> {
    const query = `
      SELECT COUNT(*) as count FROM workflow_contacts
      WHERE workflow_id = $1 AND contact_phone = $2 AND instance_id = $3
    `;

    const result = await pgPool.query(query, [workflowId, contactPhone, instanceId]);
    return parseInt(result.rows[0].count) > 0;
  }

  /**
   * Obter lista de contatos que entraram no workflow
   */
  static async getWorkflowContacts(workflowId: string): Promise<WorkflowContact[]> {
    const query = `
      SELECT * FROM workflow_contacts
      WHERE workflow_id = $1
      ORDER BY entered_at DESC
    `;

    const result = await pgPool.query(query, [workflowId]);
    return result.rows.map((row) => this.mapRowToWorkflowContact(row));
  }

  /**
   * Limpar lista de contatos do workflow
   */
  static async clearWorkflowContacts(workflowId: string): Promise<number> {
    const query = `
      DELETE FROM workflow_contacts
      WHERE workflow_id = $1
    `;

    const result = await pgPool.query(query, [workflowId]);
    return result.rowCount || 0;
  }
}

