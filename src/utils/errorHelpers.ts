import { AppError } from '../middleware/errorHandler';

/**
 * Cria um AppError de forma consistente
 */
export const createAppError = (
  message: string,
  statusCode: number = 500,
  status: string = 'error'
): AppError => {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.status = status;
  return error;
};

/**
 * Cria um AppError de validação
 */
export const createValidationError = (message: string): AppError => {
  return createAppError(message, 400, 'validation_error');
};

/**
 * Cria um AppError de não autorizado
 */
export const createUnauthorizedError = (message: string = 'Não autorizado'): AppError => {
  return createAppError(message, 401, 'unauthorized');
};

/**
 * Cria um AppError de não encontrado
 */
export const createNotFoundError = (resource: string = 'Recurso'): AppError => {
  return createAppError(`${resource} não encontrado(a)`, 404, 'not_found');
};

/**
 * Cria um AppError de conflito (duplicata)
 */
export const createConflictError = (message: string): AppError => {
  return createAppError(message, 409, 'conflict');
};

/**
 * Trata erros de catch de forma consistente
 */
export const handleControllerError = (error: unknown, defaultMessage: string = 'Erro ao processar requisição'): AppError => {
  if (error instanceof Error && 'statusCode' in error) {
    const appError = error as AppError;
    appError.statusCode = appError.statusCode || 500;
    appError.status = appError.status || 'server_error';
    appError.message = appError.message || defaultMessage;
    return appError;
  }

  const appError: AppError = new Error(error instanceof Error ? error.message : defaultMessage);
  appError.statusCode = 500;
  appError.status = 'server_error';
  return appError;
};

/**
 * Trata erros de validação do Mongoose
 */
export const handleMongooseValidationError = (error: unknown): AppError | null => {
  if (error && typeof error === 'object' && 'name' in error && error.name === 'ValidationError') {
    const mongooseError = error as { errors: Record<string, { message: string }> };
    const errorMessage = Object.values(mongooseError.errors)
      .map((err) => err.message)
      .join(', ');
    return createValidationError(errorMessage);
  }
  return null;
};

/**
 * Trata erros de duplicata do MongoDB
 */
export const handleMongooseDuplicateError = (error: unknown, customMessage?: string): AppError | null => {
  if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
    return createConflictError(customMessage || 'Recurso já existe');
  }
  return null;
};




