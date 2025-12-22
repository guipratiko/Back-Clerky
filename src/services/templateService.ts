/**
 * Service para gerenciamento de Templates de Mensagens
 * Trabalha com PostgreSQL
 */

import { pgPool } from '../config/databases';
import { parseJsonbField, stringifyJsonb } from '../utils/dbHelpers';

export type TemplateType =
  | 'text'
  | 'image'
  | 'image_caption'
  | 'video'
  | 'video_caption'
  | 'audio'
  | 'file'
  | 'sequence';

export interface Template {
  id: string;
  userId: string;
  name: string;
  type: TemplateType;
  content: any; // JSONB - estrutura varia por tipo
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTemplateData {
  userId: string;
  name: string;
  type: TemplateType;
  content: any;
}

export interface UpdateTemplateData {
  name?: string;
  content?: any;
}

// Estruturas de conteúdo por tipo
export interface TextTemplateContent {
  text: string;
}

export interface ImageTemplateContent {
  imageUrl: string;
  caption?: string;
}

export interface VideoTemplateContent {
  videoUrl: string;
  caption?: string;
}

export interface AudioTemplateContent {
  audioUrl: string;
}

export interface FileTemplateContent {
  fileUrl: string;
  fileName: string;
  mimeType?: string;
}

export interface SequenceStep {
  type: 'text' | 'image' | 'image_caption' | 'video' | 'video_caption' | 'audio' | 'file';
  content: any; // Conteúdo específico do tipo
  delay: number; // Delay em segundos antes de enviar este passo
  delayUnit: 'seconds' | 'minutes' | 'hours'; // Unidade do delay
}

export interface SequenceTemplateContent {
  steps: SequenceStep[];
}

export class TemplateService {
  /**
   * Criar novo template
   */
  static async create(data: CreateTemplateData): Promise<Template> {
    // Validar e sanitizar o tipo
    const validTypes: TemplateType[] = [
      'text',
      'image',
      'image_caption',
      'video',
      'video_caption',
      'audio',
      'file',
      'sequence',
    ];

    // Garantir que o tipo está em minúsculas e sem espaços
    const sanitizedType = (data.type || '').toLowerCase().trim() as TemplateType;

    // Log para debug
    console.log('🔍 TemplateService.create - Validando tipo:', {
      original: data.type,
      sanitized: sanitizedType,
      isValid: validTypes.includes(sanitizedType),
    });

    if (!validTypes.includes(sanitizedType)) {
      console.error('❌ TemplateService - Tipo inválido:', {
        original: data.type,
        sanitized: sanitizedType,
        validTypes,
      });
      throw new Error(`Tipo de template inválido: ${data.type}. Tipos válidos: ${validTypes.join(', ')}`);
    }

    const query = `
      INSERT INTO templates (user_id, name, type, content)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    // Log dos valores que serão inseridos
    console.log('💾 TemplateService - Inserindo no banco:', {
      userId: data.userId,
      name: data.name,
      type: sanitizedType,
      typeLength: sanitizedType.length,
      typeCharCodes: sanitizedType.split('').map(c => c.charCodeAt(0)),
      contentKeys: Object.keys(data.content || {}),
    });

    try {
    const result = await pgPool.query(query, [
      data.userId,
      data.name,
      sanitizedType, // Usar tipo sanitizado
      stringifyJsonb(data.content),
    ]);

      console.log('✅ TemplateService - Template criado com sucesso:', result.rows[0]?.id);
      return this.mapRowToTemplate(result.rows[0]);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      const errorCode = error && typeof error === 'object' && 'code' in error ? (error as { code: string }).code : 'N/A';
      
      console.error('❌ TemplateService - Erro ao inserir no banco:', {
        error: errorMessage,
        code: errorCode,
        type: sanitizedType,
        typeLength: sanitizedType.length,
        query: query,
        params: [data.userId, data.name, sanitizedType, 'JSON_CONTENT'],
      });
      
      // Se for erro de constraint, dar mais detalhes
      if (errorMessage.includes('check constraint') || errorMessage.includes('templates_type_check')) {
        console.error('🔍 Erro de constraint detectado!');
        console.error('   Tipo enviado:', JSON.stringify(sanitizedType));
        console.error('   Tipo como string:', `"${sanitizedType}"`);
        console.error('   Tipo válido?', validTypes.includes(sanitizedType));
        console.error('   Tipos válidos:', validTypes);
        console.error('   Comparação direta:', {
          'image_caption': sanitizedType === 'image_caption',
          'image_caption_length': sanitizedType.length === 'image_caption'.length,
          'charCodes': sanitizedType.split('').map(c => c.charCodeAt(0)),
          'expectedCharCodes': 'image_caption'.split('').map(c => c.charCodeAt(0)),
        });
      }
      
      throw error;
    }

    return this.mapRowToTemplate(result.rows[0]);
  }

  /**
   * Buscar template por ID
   */
  static async getById(templateId: string, userId: string): Promise<Template | null> {
    const query = `
      SELECT * FROM templates
      WHERE id = $1 AND user_id = $2
    `;

    const result = await pgPool.query(query, [templateId, userId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToTemplate(result.rows[0]);
  }

  /**
   * Listar todos os templates de um usuário
   */
  static async getByUserId(userId: string, type?: TemplateType): Promise<Template[]> {
    let query = `
      SELECT * FROM templates
      WHERE user_id = $1
    `;
    const params: any[] = [userId];

    if (type) {
      query += ` AND type = $2`;
      params.push(type);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pgPool.query(query, params);

    return result.rows.map((row) => this.mapRowToTemplate(row));
  }

  /**
   * Atualizar template
   */
  static async update(
    templateId: string,
    userId: string,
    data: UpdateTemplateData
  ): Promise<Template | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(data.name);
    }

    if (data.content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      params.push(stringifyJsonb(data.content));
    }

    if (updates.length === 0) {
      // Nada para atualizar, retornar template atual
      return this.getById(templateId, userId);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(templateId, userId);

    const query = `
      UPDATE templates
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
      RETURNING *
    `;

    const result = await pgPool.query(query, params);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToTemplate(result.rows[0]);
  }

  /**
   * Deletar template
   */
  static async delete(templateId: string, userId: string): Promise<boolean> {
    const query = `
      DELETE FROM templates
      WHERE id = $1 AND user_id = $2
    `;

    const result = await pgPool.query(query, [templateId, userId]);

    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Validar conteúdo de template de sequência
   * Deve ter no mínimo 2 etapas de tipos distintos
   */
  static validateSequenceContent(content: SequenceTemplateContent): {
    valid: boolean;
    error?: string;
  } {
    if (!content.steps || !Array.isArray(content.steps)) {
      return { valid: false, error: 'Sequência deve ter uma lista de etapas' };
    }

    if (content.steps.length < 2) {
      return { valid: false, error: 'Sequência deve ter no mínimo 2 etapas' };
    }

    // Verificar se há pelo menos 2 tipos distintos
    const types = new Set(content.steps.map((step) => step.type));
    if (types.size < 2) {
      return {
        valid: false,
        error: 'Sequência deve ter pelo menos 2 etapas de tipos distintos',
      };
    }

    // Validar cada etapa
    for (let i = 0; i < content.steps.length; i++) {
      const step = content.steps[i];
      if (!step.type || !step.content) {
        return {
          valid: false,
          error: `Etapa ${i + 1} está incompleta`,
        };
      }

      if (step.delay === undefined || step.delay < 0) {
        return {
          valid: false,
          error: `Etapa ${i + 1} deve ter um delay válido (>= 0)`,
        };
      }

      if (!['seconds', 'minutes', 'hours'].includes(step.delayUnit || 'seconds')) {
        return {
          valid: false,
          error: `Etapa ${i + 1} deve ter uma unidade de delay válida`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Mapear row do banco para Template
   */
  private static mapRowToTemplate(row: any): Template {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      type: row.type,
      content: parseJsonbField(row.content, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

