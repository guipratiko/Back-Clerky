/**
 * Funções auxiliares para Webhook API Controller
 * Elimina duplicações de código
 */

import { NextFunction } from 'express';
import { getIO } from '../socket/socketServer';
import Instance, { IInstance } from '../models/Instance';
import { ContactService } from '../services/contactService';
import { CRMColumnService } from '../services/crmColumnService';
import { normalizePhone } from './numberNormalizer';
import {
  createNotFoundError,
  createValidationError,
  handleControllerError,
} from './errorHelpers';

/**
 * Converte número de telefone para remoteJid do WhatsApp
 */
export const phoneToRemoteJid = (phone: string): string => {
  const normalized = normalizePhone(phone, '55');
  if (!normalized) {
    throw new Error('Número de telefone inválido');
  }
  return `${normalized}@s.whatsapp.net`;
};

/**
 * Extrai messageId da resposta da Evolution API
 */
export const extractMessageId = (evolutionResponse: any): string => {
  return (
    evolutionResponse.data?.key?.id ||
    evolutionResponse.data?.messageId ||
    `temp_${Date.now()}_${Math.random()}`
  );
};

/**
 * Busca instância e valida se existe
 */
export const getAndValidateInstance = async (
  instanceId: string
): Promise<IInstance> => {
  const instance = await Instance.findById(instanceId);
  if (!instance) {
    throw new Error('Instância não encontrada');
  }
  return instance;
};

/**
 * Busca ou cria contato e retorna a primeira coluna
 */
export interface ContactAndColumn {
  contact: Awaited<ReturnType<typeof ContactService.findOrCreate>>;
  firstColumn: Awaited<ReturnType<typeof CRMColumnService.getColumnsByUserId>>[0];
}

export const getOrCreateContactAndColumn = async (
  userId: string,
  instanceId: string,
  remoteJid: string,
  phone: string
): Promise<ContactAndColumn> => {
  // Garantir que as colunas padrão existem
  const columns = await CRMColumnService.initializeColumns(userId);
  const firstColumn = columns.find((col) => col.orderIndex === 0);
  
  if (!firstColumn) {
    throw new Error('Coluna padrão não encontrada');
  }

  // Buscar ou criar contato
  const normalizedPhone = normalizePhone(phone, '55') || phone;
  const contact = await ContactService.findOrCreate({
    userId,
    instanceId,
    remoteJid,
    phone: normalizedPhone,
    name: normalizedPhone, // Nome padrão será o telefone
    columnId: firstColumn.id,
  });

  return { contact, firstColumn };
};

/**
 * Emite evento WebSocket para atualizar frontend em tempo real
 */
export const emitContactUpdated = async (
  userId: string,
  instanceId: string
): Promise<void> => {
  try {
    const io = getIO();
    io.to(userId).emit('contact-updated', {
      instanceId,
    });
  } catch (error) {
    // Não falhar a requisição se o WebSocket falhar
    // Erro silencioso para não interromper o fluxo principal
  }
};

/**
 * Trata erros comuns da Webhook API de forma consistente
 * Elimina duplicação de código em múltiplos controllers
 */
export const handleWebhookAPIError = (
  error: unknown,
  defaultMessage: string,
  next: NextFunction
): void => {
  if (error instanceof Error) {
    if (error.message === 'Instância não encontrada') {
      return next(createNotFoundError('Instância'));
    }
    if (error.message === 'Coluna padrão não encontrada') {
      return next(createValidationError('Coluna padrão não encontrada'));
    }
  }
  return next(handleControllerError(error, defaultMessage));
};

