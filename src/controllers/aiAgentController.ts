/**
 * Controller para gerenciar Agentes de IA
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AIAgentService } from '../services/aiAgentService';
import { getLeads } from '../services/aiAgentProcessor';
import {
  createValidationError,
  createNotFoundError,
  handleControllerError,
} from '../utils/errorHelpers';

/**
 * Criar novo agente de IA
 * POST /api/ai-agent
 */
export const createAIAgent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { instanceId, name, prompt, waitTime, isActive } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!instanceId) {
      return next(createValidationError('ID da instância é obrigatório'));
    }

    if (!name || name.trim().length === 0) {
      return next(createValidationError('Nome do agente é obrigatório'));
    }

    if (!prompt || prompt.trim().length === 0) {
      return next(createValidationError('Prompt do agente é obrigatório'));
    }

    if (prompt.length > 100000) {
      return next(createValidationError('Prompt não pode exceder 100.000 caracteres'));
    }

    if (waitTime !== undefined && (waitTime < 1 || !Number.isInteger(waitTime))) {
      return next(createValidationError('Tempo de espera deve ser um número inteiro positivo'));
    }

    const agent = await AIAgentService.create({
      userId,
      instanceId,
      name: name.trim(),
      prompt,
      waitTime,
      isActive,
    });

    res.status(201).json({
      status: 'success',
      message: 'Agente de IA criado com sucesso',
      agent: {
        id: agent.id,
        userId: agent.userId,
        instanceId: agent.instanceId,
        name: agent.name,
        prompt: agent.prompt,
        waitTime: agent.waitTime,
        isActive: agent.isActive,
        createdAt: agent.createdAt.toISOString(),
        updatedAt: agent.updatedAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao criar agente de IA'));
  }
};

/**
 * Obter todos os agentes do usuário
 * GET /api/ai-agent
 */
export const getAIAgents = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const agents = await AIAgentService.getByUserId(userId);

    res.status(200).json({
      status: 'success',
      agents: agents.map((agent) => ({
        id: agent.id,
        userId: agent.userId,
        instanceId: agent.instanceId,
        name: agent.name,
        prompt: agent.prompt,
        waitTime: agent.waitTime,
        isActive: agent.isActive,
        createdAt: agent.createdAt.toISOString(),
        updatedAt: agent.updatedAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao obter agentes de IA'));
  }
};

/**
 * Obter agente por ID
 * GET /api/ai-agent/:id
 */
export const getAIAgent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const agent = await AIAgentService.getById(id, userId);

    if (!agent) {
      return next(createNotFoundError('Agente de IA'));
    }

    res.status(200).json({
      status: 'success',
      agent: {
        id: agent.id,
        userId: agent.userId,
        instanceId: agent.instanceId,
        name: agent.name,
        prompt: agent.prompt,
        waitTime: agent.waitTime,
        isActive: agent.isActive,
        createdAt: agent.createdAt.toISOString(),
        updatedAt: agent.updatedAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao obter agente de IA'));
  }
};

/**
 * Atualizar agente
 * PUT /api/ai-agent/:id
 */
export const updateAIAgent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { name, prompt, waitTime, isActive } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (prompt !== undefined && prompt.length > 100000) {
      return next(createValidationError('Prompt não pode exceder 100.000 caracteres'));
    }

    if (waitTime !== undefined && (waitTime < 1 || !Number.isInteger(waitTime))) {
      return next(createValidationError('Tempo de espera deve ser um número inteiro positivo'));
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (prompt !== undefined) updateData.prompt = prompt;
    if (waitTime !== undefined) updateData.waitTime = waitTime;
    if (isActive !== undefined) updateData.isActive = isActive;

    const agent = await AIAgentService.update(id, userId, updateData);

    if (!agent) {
      return next(createNotFoundError('Agente de IA'));
    }

    res.status(200).json({
      status: 'success',
      message: 'Agente de IA atualizado com sucesso',
      agent: {
        id: agent.id,
        userId: agent.userId,
        instanceId: agent.instanceId,
        name: agent.name,
        prompt: agent.prompt,
        waitTime: agent.waitTime,
        isActive: agent.isActive,
        createdAt: agent.createdAt.toISOString(),
        updatedAt: agent.updatedAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao atualizar agente de IA'));
  }
};

/**
 * Deletar agente
 * DELETE /api/ai-agent/:id
 */
export const deleteAIAgent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const deleted = await AIAgentService.delete(id, userId);

    if (!deleted) {
      return next(createNotFoundError('Agente de IA'));
    }

    res.status(200).json({
      status: 'success',
      message: 'Agente de IA deletado com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao deletar agente de IA'));
  }
};

/**
 * Obter leads (contatos com memória)
 * GET /api/ai-agent/leads
 */
export const getLeads = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { instanceId } = req.query;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const leads = await getLeadsFromProcessor(userId, instanceId as string | undefined);

    res.status(200).json({
      status: 'success',
      leads: leads.map((lead) => ({
        phone: lead.structuredData.phone,
        name: lead.structuredData.name,
        interest: lead.structuredData.interest,
        detectedInterest: lead.structuredData.detectedInterest,
        lastInteraction: lead.structuredData.lastInteraction,
        history: lead.history,
      })),
      count: leads.length,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao obter leads'));
  }
};

/**
 * Callback de transcrição de áudio
 * POST /api/ai-agent/transcription-callback
 * 
 * URL para receber transcrições: https://api.clerky.com.br/api/ai-agent/transcription-callback
 * 
 * Payload esperado:
 * {
 *   "userId": "string",
 *   "contactPhone": "string",
 *   "instanceId": "string",
 *   "messageId": "string",
 *   "transcription": "string"
 * }
 */
export const transcriptionCallback = async (
  req: any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId, contactPhone, instanceId, messageId, transcription } = req.body;

    if (!transcription) {
      return res.status(400).json({
        status: 'error',
        message: 'Transcrição não fornecida',
      });
    }

    console.log(`📝 Transcrição recebida para mensagem ${messageId}: ${transcription.substring(0, 50)}...`);

    // Atualizar mensagem no buffer com a transcrição
    // A transcrição será processada quando o buffer for processado após o tempo de espera
    const { updateMessageInBuffer } = await import('../services/aiAgentProcessor');
    await updateMessageInBuffer(
      userId,
      instanceId,
      contactPhone,
      messageId,
      transcription
    );

    res.status(200).json({
      status: 'success',
      message: 'Transcrição recebida e processada',
    });
  } catch (error: unknown) {
    console.error('❌ Erro ao processar callback de transcrição:', error);
    // Retornar 200 mesmo em caso de erro para evitar retentativas
    res.status(200).json({
      status: 'error',
      message: 'Erro ao processar transcrição, mas recebida',
    });
  }
};

