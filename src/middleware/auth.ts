import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler';
import { JWT_CONFIG } from '../config/constants';
import User from '../models/User';
import { createForbiddenError, handleControllerError } from '../utils/errorHelpers';

// Interface para adicionar user ao Request
export interface AuthRequest extends Request {
  user?: {
    id: string;
  };
}

export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    let token: string | undefined;

    // Verificar se o token está no header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      const error: AppError = new Error('Token não fornecido. Faça login para acessar.');
      error.statusCode = 401;
      error.status = 'unauthorized';
      return next(error);
    }

    // Verificar token
    const decoded = jwt.verify(token, JWT_CONFIG.SECRET) as { id: string };

    // Adicionar user ao request
    req.user = {
      id: decoded.id,
    };

    next();
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === 'JsonWebTokenError') {
        const jwtError: AppError = new Error('Token inválido');
        jwtError.statusCode = 401;
        jwtError.status = 'unauthorized';
        return next(jwtError);
      }

      if (error.name === 'TokenExpiredError') {
        const expiredError: AppError = new Error('Token expirado. Faça login novamente.');
        expiredError.statusCode = 401;
        expiredError.status = 'unauthorized';
        return next(expiredError);
      }
    }

    next(error);
  }
};

/**
 * Middleware para verificar se o usuário tem plano premium
 * Deve ser usado APÓS o middleware protect
 */
export const requirePremium = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      const error: AppError = new Error('Usuário não autenticado');
      error.statusCode = 401;
      error.status = 'unauthorized';
      return next(error);
    }

    // Buscar usuário para verificar isPremium
    const user = await User.findById(userId).select('isPremium');

    if (!user) {
      const error: AppError = new Error('Usuário não encontrado');
      error.statusCode = 404;
      error.status = 'not_found';
      return next(error);
    }

    if (!user.isPremium) {
      return next(createForbiddenError('Esta funcionalidade requer plano Premium. Faça upgrade para acessar.'));
    }

    next();
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao verificar plano premium'));
  }
};

/**
 * Middleware para verificar se o usuário é administrador
 * Deve ser usado APÓS o middleware protect
 */
export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      const error: AppError = new Error('Usuário não autenticado');
      error.statusCode = 401;
      error.status = 'unauthorized';
      return next(error);
    }

    // Buscar usuário para verificar admin
    const user = await User.findById(userId).select('admin');

    if (!user) {
      const error: AppError = new Error('Usuário não encontrado');
      error.statusCode = 404;
      error.status = 'not_found';
      return next(error);
    }

    if (!user.admin) {
      return next(createForbiddenError('Acesso negado. Esta funcionalidade é exclusiva para administradores.'));
    }

    next();
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao verificar permissões de administrador'));
  }
};

