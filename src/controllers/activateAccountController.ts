/**
 * Controller para ativação de conta (definir senha após pré-cadastro)
 */

import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User';
import { JWT_CONFIG } from '../config/constants';
import jwt from 'jsonwebtoken';
import {
  createValidationError,
  createUnauthorizedError,
  createNotFoundError,
  handleControllerError,
} from '../utils/errorHelpers';

/**
 * Validar token de ativação e obter dados do usuário
 * GET /api/auth/activate?token=...
 */
export const validateActivationToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return next(createValidationError('Token de ativação é obrigatório'));
    }

    // Buscar usuário pelo token de ativação
    const user = await User.findOne({
      activationToken: token,
      activationTokenExpires: { $gt: new Date() }, // Token não expirado
    }).select('name email activationToken activationTokenExpires');

    if (!user) {
      return next(createNotFoundError('Token de ativação inválido ou expirado'));
    }

    res.status(200).json({
      status: 'success',
      user: {
        name: user.name,
        email: user.email,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao validar token de ativação'));
  }
};

/**
 * Ativar conta (definir senha)
 * POST /api/auth/activate
 */
export const activateAccount = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return next(createValidationError('Token e senha são obrigatórios'));
    }

    if (password.length < 6) {
      return next(createValidationError('Senha deve ter no mínimo 6 caracteres'));
    }

    // Buscar usuário pelo token de ativação
    const user = await User.findOne({
      activationToken: token,
      activationTokenExpires: { $gt: new Date() }, // Token não expirado
    }).select('+password');

    if (!user) {
      return next(createNotFoundError('Token de ativação inválido ou expirado'));
    }

    // Hash da nova senha
    const hashedPassword = await bcrypt.hash(password, 12);

    // Atualizar usuário: remover token de ativação e definir senha
    user.password = hashedPassword;
    user.activationToken = undefined;
    user.activationTokenExpires = undefined;
    await user.save();

    // Gerar token JWT
    const jwtToken = jwt.sign(
      { id: user._id.toString() },
      JWT_CONFIG.SECRET,
      { expiresIn: JWT_CONFIG.EXPIRE } as jwt.SignOptions
    );

    console.log(`✅ Conta ativada para ${user.email}`);

    res.status(200).json({
      status: 'success',
      message: 'Conta ativada com sucesso',
      token: jwtToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isPremium: user.isPremium,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao ativar conta'));
  }
};


