/**
 * Controller para receber webhook de compra premium da APPMAX
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import User from '../models/User';
import { PREMIUM_WEBHOOK_CONFIG, EMAIL_CONFIG } from '../config/constants';
import { cleanCPF, isValidCPF } from '../utils/cpfValidator';
import { normalizePhone } from '../utils/numberNormalizer';
import { normalizeName } from '../utils/formatters';
import { sendActivationEmail } from '../services/emailService';
import {
  createValidationError,
  createUnauthorizedError,
  handleControllerError,
} from '../utils/errorHelpers';

interface PremiumWebhookBody {
  email: string;
  name: string;
  Telefone: string;
  cpf: string;
  'transaction id': string;
  status: string;
  amount: number;
  WEBHOOK_SECRET: string;
  evento: string;
}

/**
 * Receber webhook de compra premium
 * POST /api/webhook/premium-purchase
 */
export const receivePremiumWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = req.body as PremiumWebhookBody;

    // Validar WEBHOOK_SECRET
    if (!body.WEBHOOK_SECRET || body.WEBHOOK_SECRET !== PREMIUM_WEBHOOK_CONFIG.SECRET) {
      return next(createUnauthorizedError('WEBHOOK_SECRET inválido'));
    }

    // Validar campos obrigatórios
    if (!body.email || !body.name || !body.cpf || !body.status || !body.evento) {
      return next(createValidationError('Campos obrigatórios faltando: email, name, cpf, status, evento'));
    }

    // Validar status e evento
    if (body.status !== 'aprovado' || body.evento !== 'OrderPaid') {
      return res.status(200).json({
        status: 'success',
        message: 'Webhook recebido, mas status não é "aprovado" ou evento não é "OrderPaid". Ignorando.',
      });
    }

    // Limpar e validar CPF
    const cleanCpf = cleanCPF(body.cpf);
    if (!isValidCPF(cleanCpf)) {
      return next(createValidationError('CPF inválido'));
    }

    // Normalizar dados
    const normalizedName = normalizeName(body.name);
    const normalizedPhone = body.Telefone ? normalizePhone(body.Telefone, '55') : undefined;
    const normalizedEmail = body.email.toLowerCase().trim();

    // Validar formato de email
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      return next(createValidationError('Email inválido'));
    }

    // Buscar usuário por CPF
    const existingUser = await User.findOne({ cpf: cleanCpf });

    if (existingUser) {
      // Usuário já existe: apenas atualizar isPremium
      existingUser.isPremium = true;
      await existingUser.save();

      console.log(`✅ Usuário ${existingUser.email} atualizado para Premium (CPF: ${cleanCpf})`);

      return res.status(200).json({
        status: 'success',
        message: 'Usuário atualizado para Premium',
        user: {
          id: existingUser._id,
          email: existingUser.email,
          name: existingUser.name,
          isPremium: existingUser.isPremium,
        },
      });
    }

    // Usuário não existe: criar pré-cadastro
    // Gerar token de ativação (UUID)
    const activationToken = uuidv4();
    const activationTokenExpires = new Date();
    activationTokenExpires.setDate(activationTokenExpires.getDate() + 7); // 7 dias

    // Gerar senha temporária (será alterada na ativação)
    const tempPassword = uuidv4().replace(/-/g, '').substring(0, 12); // Senha temporária aleatória
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    // Criar usuário
    const newUser = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      password: hashedPassword,
      cpf: cleanCpf,
      phone: normalizedPhone,
      isPremium: true, // Já é premium
      activationToken,
      activationTokenExpires,
    });

    console.log(`✅ Pré-cadastro criado para ${newUser.email} (CPF: ${cleanCpf})`);

    // Enviar email de ativação
    try {
      await sendActivationEmail(normalizedEmail, normalizedName, activationToken);
    } catch (emailError) {
      console.error('❌ Erro ao enviar email de ativação:', emailError);
      // Não falhar o webhook se o email falhar, apenas logar
    }

    return res.status(200).json({
      status: 'success',
      message: 'Pré-cadastro criado com sucesso. Email de ativação enviado.',
      user: {
        id: newUser._id,
        email: newUser.email,
        name: newUser.name,
        isPremium: newUser.isPremium,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao processar webhook de compra premium'));
  }
};


