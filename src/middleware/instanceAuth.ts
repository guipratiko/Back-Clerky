import { Request, Response, NextFunction } from 'express';
import Instance from '../models/Instance';
import { AppError } from './errorHandler';

// Interface para adicionar instance ao Request
export interface InstanceAuthRequest extends Request {
  instance?: {
    _id: string;
    instanceName: string;
    userId: string;
  };
}

/**
 * Middleware para autenticar requisições usando token de instância
 * Valida o token no header Authorization: Bearer {token}
 */
export const authenticateInstance = async (
  req: InstanceAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    // Verificar se o token está no header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      const error: AppError = new Error('Token de instância não fornecido');
      error.statusCode = 401;
      error.status = 'unauthorized';
      return next(error);
    }

    // Buscar instância pelo token
    const instance = await Instance.findOne({ token }).select('_id instanceName userId');

    if (!instance) {
      const error: AppError = new Error('Token de instância inválido');
      error.statusCode = 401;
      error.status = 'unauthorized';
      return next(error);
    }

    // Adicionar instância ao request
    req.instance = {
      _id: instance._id.toString(),
      instanceName: instance.instanceName,
      userId: instance.userId.toString(),
    };

    next();
  } catch (error: unknown) {
    const authError: AppError = new Error('Erro ao autenticar instância');
    authError.statusCode = 500;
    authError.status = 'error';
    return next(authError);
  }
};

