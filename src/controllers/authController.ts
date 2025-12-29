import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { normalizeName } from '../utils/formatters';
import { normalizePhone } from '../utils/numberNormalizer';
import { cleanCPF, isValidCPF } from '../utils/cpfValidator';
import { AuthRequest } from '../middleware/auth';
import { JWT_CONFIG } from '../config/constants';
import {
  createValidationError,
  createUnauthorizedError,
  createConflictError,
  createNotFoundError,
  handleControllerError,
  handleMongooseValidationError,
  handleMongooseDuplicateError,
} from '../utils/errorHelpers';

// Gerar token JWT
const generateToken = (userId: string): string => {
  return jwt.sign(
    { id: userId },
    JWT_CONFIG.SECRET,
    { expiresIn: JWT_CONFIG.EXPIRE } as jwt.SignOptions
  );
};

// Login
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    // Validação
    if (!email || !password) {
      return next(createValidationError('Email e senha são obrigatórios'));
    }

    // Buscar usuário com senha
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return next(createUnauthorizedError('Credenciais inválidas'));
    }

    // Verificar senha
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return next(createUnauthorizedError('Credenciais inválidas'));
    }

    // Gerar token
    const token = generateToken(user._id.toString());

    // Retornar resposta (sem senha)
    res.status(200).json({
      status: 'success',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
        companyName: user.companyName,
        phone: user.phone,
        timezone: user.timezone || 'America/Sao_Paulo',
        isPremium: user.isPremium || false,
        cpf: user.cpf,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao fazer login'));
  }
};

// Registro
export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password, cpf } = req.body;

    // Validação
    if (!name || !email || !password || !cpf) {
      return next(createValidationError('Nome, email, senha e CPF são obrigatórios'));
    }

    // Validar CPF
    const cleanCpf = cleanCPF(cpf);
    if (!isValidCPF(cleanCpf)) {
      return next(createValidationError('CPF inválido'));
    }

    // Verificar se usuário já existe (por email ou CPF)
    const existingUserByEmail = await User.findOne({ email });
    if (existingUserByEmail) {
      return next(createConflictError('Email já cadastrado'));
    }

    const existingUserByCpf = await User.findOne({ cpf: cleanCpf });
    if (existingUserByCpf) {
      return next(createConflictError('CPF já cadastrado'));
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 12);

    // Normalizar nome antes de criar
    const normalizedName = normalizeName(name);

    // Criar usuário
    const user = await User.create({
      name: normalizedName,
      email,
      password: hashedPassword,
      cpf: cleanCpf,
    });

    // Gerar token
    const token = generateToken(user._id.toString());

    // Retornar resposta (sem senha)
    res.status(201).json({
      status: 'success',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
        companyName: user.companyName,
        phone: user.phone,
        timezone: user.timezone || 'America/Sao_Paulo',
        isPremium: user.isPremium || false,
        cpf: user.cpf,
      },
    });
  } catch (error: unknown) {
    // Erro de validação do Mongoose
    const validationError = handleMongooseValidationError(error);
    if (validationError) return next(validationError);

    // Erro de duplicação
    const duplicateError = handleMongooseDuplicateError(error, 'Email já cadastrado');
    if (duplicateError) return next(duplicateError);

    return next(handleControllerError(error, 'Erro ao registrar usuário'));
  }
};

// Obter usuário atual (protegido)
export const getMe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // req.user será definido pelo middleware de autenticação
    const userId = req.user?.id;

    if (!userId) {
      return next(createUnauthorizedError('Usuário não autenticado'));
    }

    const user = await User.findById(userId);

    if (!user) {
      return next(createNotFoundError('Usuário'));
    }

    res.status(200).json({
      status: 'success',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
        companyName: user.companyName,
        phone: user.phone,
        timezone: user.timezone || 'America/Sao_Paulo',
        isPremium: user.isPremium || false,
        cpf: user.cpf,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao obter dados do usuário'));
  }
};

// Atualizar perfil
export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(createUnauthorizedError('Usuário não autenticado'));
    }

    const { name, profilePicture, companyName, phone, timezone } = req.body;

    // Buscar usuário
    const user = await User.findById(userId);

    if (!user) {
      return next(createNotFoundError('Usuário'));
    }

    // Atualizar campos fornecidos
    if (name !== undefined) {
      if (!name || name.trim().length < 3) {
        return next(createValidationError('Nome deve ter no mínimo 3 caracteres'));
      }
      // Normalizar nome: primeira letra maiúscula, demais minúsculas
      user.name = normalizeName(name);
    }

    if (profilePicture !== undefined) {
      user.profilePicture = profilePicture;
    }

    if (companyName !== undefined) {
      // Normalizar nome da empresa
      user.companyName = companyName?.trim() ? normalizeName(companyName.trim()) : undefined;
    }

    if (phone !== undefined) {
      // Normalizar telefone com DDI
      const normalized = phone?.trim() ? normalizePhone(phone.trim(), '55') : null;
      user.phone = normalized || undefined;
    }

    if (timezone !== undefined) {
      // Validar timezone (formato IANA, ex: 'America/Sao_Paulo')
      if (timezone && timezone.trim()) {
        // Validar se é um timezone válido tentando criar uma data
        try {
          // Verificar se o timezone é válido
          Intl.DateTimeFormat(undefined, { timeZone: timezone.trim() });
          user.timezone = timezone.trim();
        } catch {
          return next(createValidationError('Fuso horário inválido'));
        }
      } else {
        user.timezone = 'America/Sao_Paulo'; // Default
      }
    }

    await user.save();

    res.status(200).json({
      status: 'success',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
        companyName: user.companyName,
        phone: user.phone,
      },
    });
  } catch (error: unknown) {
    const validationError = handleMongooseValidationError(error);
    if (validationError) return next(validationError);
    return next(handleControllerError(error, 'Erro ao atualizar perfil'));
  }
};

// Trocar senha
export const changePassword = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(createUnauthorizedError('Usuário não autenticado'));
    }

    const { currentPassword, newPassword } = req.body;

    // Validação
    if (!currentPassword || !newPassword) {
      return next(createValidationError('Senha atual e nova senha são obrigatórias'));
    }

    if (newPassword.length < 6) {
      return next(createValidationError('Nova senha deve ter no mínimo 6 caracteres'));
    }

    // Buscar usuário com senha
    const user = await User.findById(userId).select('+password');

    if (!user) {
      return next(createNotFoundError('Usuário'));
    }

    // Verificar senha atual
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
      return next(createUnauthorizedError('Senha atual incorreta'));
    }

    // Hash da nova senha
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;

    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Senha alterada com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao alterar senha'));
  }
};

