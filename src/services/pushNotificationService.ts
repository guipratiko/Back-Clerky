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

    // Validar formato do Team ID (deve ser alfanumérico, não UUID)
    // Se for UUID, pode ser que esteja errado, mas vamos tentar mesmo assim
    if (teamId.includes('-') && teamId.length > 15) {
      console.warn(`⚠️ Team ID parece ser um UUID (${teamId}). Team ID da Apple geralmente é um código de 10 caracteres.`);
    }

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

    console.log(`🔐 Token JWT gerado com sucesso (${token.length} caracteres)`);
    return token;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    throw new Error(`Erro ao gerar token APNs: ${errorMessage}`);
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

  // Verificar se o arquivo de chave existe
  if (!fs.existsSync(keyPath)) {
    throw new Error(`Arquivo de chave APNs não encontrado: ${keyPath}`);
  }

  // Gerar token de autenticação
  const authToken = generateAPNsToken(keyId, teamId, keyPath);

  // URL do APNs
  const apnsUrl = isProduction
    ? `https://api.push.apple.com/3/device/${deviceToken}`
    : `https://api.sandbox.push.apple.com/3/device/${deviceToken}`;

  console.log(`📤 Enviando push para: ${isProduction ? 'Production' : 'Sandbox'}`);
  console.log(`🔑 Key ID: ${keyId}, Team ID: ${teamId}`);
  console.log(`📦 Bundle ID: ${bundleId}`);
  console.log(`🔗 URL: ${apnsUrl.substring(0, 50)}...`);
  console.log(`📝 Payload:`, JSON.stringify(payload, null, 2));

  try {
    // Usar https nativo do Node.js ao invés de axios para evitar problemas com follow-redirects
    const https = await import('https');
    const response = await new Promise<{ statusCode: number; data: any; headers: any }>((resolve, reject) => {
      const url = new URL(apnsUrl);
      const postData = JSON.stringify(payload);

      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apns-topic': bundleId,
          'apns-priority': '10',
          'apns-push-type': 'alert',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 10000,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsedData: any = {};
          try {
            parsedData = data ? JSON.parse(data) : {};
          } catch {
            parsedData = { raw: data };
          }
          resolve({
            statusCode: res.statusCode || 0,
            data: parsedData,
            headers: res.headers,
          });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout na requisição'));
      });

      req.write(postData);
      req.end();
    });

    if (response.statusCode >= 200 && response.statusCode < 300) {
      console.log(`✅ Push enviado com sucesso. Status: ${response.statusCode}`);
      if (response.headers['apns-id']) {
        console.log(`   APNs-ID: ${response.headers['apns-id']}`);
      }
    } else {
      // APNs retornou erro
      const apnsError = response.data as APNsResponse;
      const errorMessage = apnsError?.reason || `HTTP ${response.statusCode}`;
      console.error(`❌ APNs retornou erro ${response.statusCode}: ${errorMessage}`);
      throw new Error(`APNs retornou erro ${response.statusCode}: ${errorMessage}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ Erro ao enviar push:', errorMessage);
    
    if (error instanceof Error) {
      // Verificar tipos específicos de erro
      if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ETIMEDOUT')) {
        throw new Error(`Erro de conexão: ${errorMessage}`);
      }
      if (errorMessage.includes('certificate') || errorMessage.includes('SSL')) {
        throw new Error(`Erro de certificado SSL: ${errorMessage}`);
      }
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
 * Enviar notificação promocional para todos os dispositivos iOS ativos
 */
export async function sendPromotionalNotificationToAll(
  title: string,
  body: string,
  data?: Record<string, any>,
  filters?: {
    platform?: 'ios' | 'android';
    isPremium?: boolean;
  }
): Promise<{
  totalDevices: number;
  successCount: number;
  failedCount: number;
  errors: string[];
}> {
  const User = (await import('../models/User')).default;

  // Buscar todos os dispositivos ativos
  const query: any = { isActive: true };
  
  if (filters?.platform) {
    query.platform = filters.platform;
  } else {
    // Por padrão, enviar apenas para iOS
    query.platform = 'ios';
  }

  const devices = await DeviceToken.find(query);

  // Log para debug: mostrar quantos dispositivos foram encontrados e suas plataformas
  console.log(`🔍 Dispositivos encontrados: ${devices.length}`);
  const platformCounts = devices.reduce((acc: any, device: any) => {
    const platform = device.platform || 'unknown';
    acc[platform] = (acc[platform] || 0) + 1;
    return acc;
  }, {});
  console.log(`📱 Distribuição por plataforma:`, platformCounts);

  // Se houver filtro de premium, buscar usuários e filtrar
  let filteredDevices = devices;
  if (filters?.isPremium !== undefined) {
    const userIds = [...new Set(devices.map((d: any) => d.userId.toString()))];
    const users = await User.find({ _id: { $in: userIds } }).select('_id isPremium');
    const userMap = new Map(users.map((u: any) => [u._id.toString(), u.isPremium]));
    
    filteredDevices = devices.filter((device: any) => {
      const isPremium = userMap.get(device.userId.toString());
      return isPremium === filters.isPremium;
    });
  }

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

  let successCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  console.log(`📤 Enviando notificação promocional para ${filteredDevices.length} dispositivo(s)...`);

  for (const device of filteredDevices) {
    try {
      await sendPushNotification(
        device.deviceToken,
        payload,
        device.isProduction ?? true
      );
      successCount++;
    } catch (error) {
      failedCount++;
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      errors.push(`Device ${device.deviceToken.substring(0, 20)}...: ${errorMessage}`);

      // Se o token for inválido, marcar como inativo
      if (errorMessage.includes('BadDeviceToken') || errorMessage.includes('Unregistered')) {
        device.isActive = false;
        await device.save();
      }
    }
  }

  console.log(`✅ Notificação promocional enviada: ${successCount} sucesso, ${failedCount} falhas`);

  return {
    totalDevices: filteredDevices.length,
    successCount,
    failedCount,
    errors: errors.slice(0, 10), // Limitar a 10 erros para não sobrecarregar a resposta
  };
}

