/**
 * Controller para operações administrativas
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  createValidationError,
  handleControllerError,
} from '../utils/errorHelpers';
import { sendPromotionalNotificationToAll } from '../services/pushNotificationService';

interface SendPromotionBody {
  title: string;
  body: string;
  data?: Record<string, any>;
  filters?: {
    platform?: 'ios' | 'android';
    isPremium?: boolean;
  };
}

/**
 * Enviar notificação promocional para todos os dispositivos iOS
 * POST /api/admin/send-promotion
 */
export const sendPromotion = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { title, body, data, filters }: SendPromotionBody = req.body;

    // Validação
    if (!title || !body) {
      return next(createValidationError('Título e corpo da notificação são obrigatórios'));
    }

    if (title.trim().length === 0 || body.trim().length === 0) {
      return next(createValidationError('Título e corpo da notificação não podem estar vazios'));
    }

    // Enviar notificação para todos os dispositivos
    const result = await sendPromotionalNotificationToAll(
      title.trim(),
      body.trim(),
      data,
      filters
    );

    res.status(200).json({
      status: 'success',
      message: 'Notificação promocional enviada',
      result: {
        totalDevices: result.totalDevices,
        successCount: result.successCount,
        failedCount: result.failedCount,
        errors: result.errors,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao enviar notificação promocional'));
  }
};

