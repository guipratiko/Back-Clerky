import mongoose from 'mongoose';
import { createValidationError, createUnauthorizedError } from './errorHelpers';

/**
 * Converte userId (string ou ObjectId) para ObjectId
 * @param userId - ID do usuário (string ou ObjectId)
 * @returns ObjectId do usuário
 * @throws AppError se o ID for inválido
 */
export function convertUserIdToObjectId(userId: string | mongoose.Types.ObjectId): mongoose.Types.ObjectId {
  try {
    return typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
  } catch (error) {
    throw createValidationError('ID de usuário inválido');
  }
}

/**
 * Valida se userId existe e retorna ObjectId
 * @param userId - ID do usuário (pode ser undefined)
 * @returns ObjectId do usuário
 * @throws AppError se userId não existir ou for inválido
 */
export function validateAndConvertUserId(userId: string | mongoose.Types.ObjectId | undefined): mongoose.Types.ObjectId {
  if (!userId) {
    throw createUnauthorizedError('Usuário não autenticado');
  }
  return convertUserIdToObjectId(userId);
}



