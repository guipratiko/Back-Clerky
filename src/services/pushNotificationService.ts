import axios from 'axios';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import DeviceToken from '../models/DeviceToken';
import { APPLE_CONFIG } from '../config/constants';

interface APNsPayload {
  aps: {
    alert?: {
      title?: string;
      body: string;
      subtitle?: string;
    };
    sound?: string;
    badge?: number;
    'content-available'?: number;
    category?: string;
  };
  [key: string]: any; // Dados customizados
}

interface APNsResponse {
  reason?: string;
  'apns-id'?: string;
}

/**
 * Gerar token JWT para autenticação APNs
 */
function generateAPNsToken(keyId: string, teamId: string, keyPath: string): string {
  try {
    const privateKey = fs.readFileSync(keyPath, 'utf8');

    const token = jwt.sign(
      {
        iss: teamId,
        iat: Math.floor(Date.now() / 1000),
      },
      privateKey,
      {
        algorithm: 'ES256',
        header: {
          alg: 'ES256',
          kid: keyId,
        },
        expiresIn: '1h',
      }
    );

    return token;
  } catch (error) {
    throw new Error(`Erro ao gerar token APNs: ${error}`);
  }
}

/**
 * Enviar push notification via APNs
 */
export async function sendPushNotification(
  deviceToken: string,
  payload: APNsPayload,
  isProduction: boolean = true
): Promise<void> {
  const keyId = APPLE_CONFIG.KEY_ID;
  const teamId = APPLE_CONFIG.TEAM_ID;
  const keyPath = path.isAbsolute(APPLE_CONFIG.KEY_PATH)
    ? APPLE_CONFIG.KEY_PATH
    : path.join(__dirname, '../../', APPLE_CONFIG.KEY_PATH);
  const bundleId = APPLE_CONFIG.BUNDLE_ID;

  // Gerar token de autenticação
  const authToken = generateAPNsToken(keyId, teamId, keyPath);

  // URL do APNs
  const apnsUrl = isProduction
    ? `https://api.push.apple.com/3/device/${deviceToken}`
    : `https://api.sandbox.push.apple.com/3/device/${deviceToken}`;

  try {
    const response = await axios.post<APNsResponse>(
      apnsUrl,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apns-topic': bundleId,
          'apns-priority': '10',
          'apns-push-type': 'alert',
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log(`✅ Push enviado com sucesso. APNs-ID: ${response.data['apns-id']}`);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const apnsError = error.response?.data as APNsResponse;
      throw new Error(`Erro ao enviar push: ${apnsError?.reason || error.message}`);
    }
    throw error;
  }
}

/**
 * Enviar push para todos os dispositivos de um usuário
 */
export async function sendPushToUser(
  userId: string,
  payload: APNsPayload
): Promise<number> {
  const devices = await DeviceToken.find({ userId: userId as any, isActive: true });

  let successCount = 0;
  const errors: string[] = [];

  for (const device of devices) {
    try {
      await sendPushNotification(device.deviceToken, payload, device.isProduction ?? true);
      successCount++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      errors.push(`Device ${device.deviceToken}: ${errorMessage}`);

      // Se o token for inválido, marcar como inativo
      if (errorMessage.includes('BadDeviceToken') || errorMessage.includes('Unregistered')) {
        device.isActive = false;
        await device.save();
      }
    }
  }

  if (errors.length > 0) {
    console.warn(`⚠️ Alguns pushes falharam:`, errors);
  }

  return successCount;
}

/**
 * Enviar notificação de instância conectada/desconectada
 */
export async function sendInstanceStatusNotification(
  userId: string,
  instanceName: string,
  isConnected: boolean
): Promise<void> {
  const payload: APNsPayload = {
    aps: {
      alert: {
        title: isConnected ? 'Instância Conectada' : 'Instância Desconectada',
        body: `${instanceName} foi ${isConnected ? 'conectada' : 'desconectada'}`,
      },
      sound: 'default',
      badge: 1,
    },
    type: 'instance_status',
    instanceName,
    isConnected,
  };

  await sendPushToUser(userId, payload);
}

/**
 * Enviar notificação de disparo iniciado/completo
 */
export async function sendDispatchNotification(
  userId: string,
  dispatchName: string,
  status: 'started' | 'completed' | 'failed'
): Promise<void> {
  const statusMessages = {
    started: { title: 'Disparo Iniciado', body: `${dispatchName} começou a ser enviado` },
    completed: { title: 'Disparo Concluído', body: `${dispatchName} foi concluído com sucesso` },
    failed: { title: 'Disparo Falhou', body: `${dispatchName} falhou ao ser enviado` },
  };

  const message = statusMessages[status];

  const payload: APNsPayload = {
    aps: {
      alert: {
        title: message.title,
        body: message.body,
      },
      sound: 'default',
      badge: 1,
    },
    type: 'dispatch_status',
    dispatchName,
    status,
  };

  await sendPushToUser(userId, payload);
}

/**
 * Enviar notificação promocional
 */
export async function sendPromotionalNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  const payload: APNsPayload = {
    aps: {
      alert: {
        title,
        body,
      },
      sound: 'default',
      badge: 1,
    },
    type: 'promotional',
    ...data,
  };

  await sendPushToUser(userId, payload);
}

/**
 * Enviar push para todos os dispositivos iOS ativos
 * @param payload - Payload da notificação APNs
 * @returns Estatísticas do envio (sucessos, falhas, total)
 */
export async function sendPushToAllIOSUsers(
  payload: APNsPayload
): Promise<{ success: number; failed: number; total: number; errors: string[] }> {
  // Buscar todos os dispositivos iOS ativos
  const devices = await DeviceToken.find({ 
    platform: 'ios',
    isActive: true 
  });

  let successCount = 0;
  const errors: string[] = [];
  const total = devices.length;

  console.log(`📱 Enviando push para ${total} dispositivos iOS...`);

  // Enviar para cada dispositivo
  for (const device of devices) {
    try {
      await sendPushNotification(
        device.deviceToken, 
        payload, 
        device.isProduction ?? true
      );
      successCount++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      errors.push(`Device ${device.deviceToken.substring(0, 20)}...: ${errorMessage}`);

      // Se o token for inválido, marcar como inativo
      if (errorMessage.includes('BadDeviceToken') || errorMessage.includes('Unregistered')) {
        device.isActive = false;
        await device.save();
        console.log(`⚠️ Token inválido desativado: ${device.deviceToken.substring(0, 20)}...`);
      }
    }
  }

  const failed = total - successCount;

  console.log(`✅ Push enviado: ${successCount} sucessos, ${failed} falhas de ${total} total`);

  if (errors.length > 0 && errors.length <= 10) {
    console.warn(`⚠️ Erros encontrados:`, errors);
  } else if (errors.length > 10) {
    console.warn(`⚠️ ${errors.length} erros encontrados (mostrando primeiros 10):`, errors.slice(0, 10));
  }

  return {
    success: successCount,
    failed,
    total,
    errors,
  };
}

