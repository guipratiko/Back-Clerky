import axios from 'axios';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import * as admin from 'firebase-admin';
import DeviceToken from '../models/DeviceToken';
import { APPLE_CONFIG, FIREBASE_CONFIG } from '../config/constants';

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

  // Log das configurações sendo usadas
  console.log('\n📋 Configurações APNs:');
  console.log(`   Key ID: ${keyId}`);
  console.log(`   Team ID: ${teamId} (${teamId.length} caracteres)`);
  console.log(`   Bundle ID: ${bundleId}`);
  console.log(`   Key Path: ${keyPath}`);
  console.log(`   Key Path existe: ${fs.existsSync(keyPath)}`);

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
  console.log(`🔑 Key ID: ${keyId}`);
  console.log(`👥 Team ID: ${teamId} (${teamId.length} caracteres)`);
  console.log(`📦 Bundle ID: ${bundleId}`);
  console.log(`🔗 URL: ${apnsUrl.substring(0, 50)}...`);
  console.log(`📝 Payload:`, JSON.stringify(payload, null, 2));

  try {
    // APNs requer HTTP/2, não HTTP/1.1
    const http2 = await import('http2');
    const response = await new Promise<{ statusCode: number; data: any; headers: any }>((resolve, reject) => {
      const url = new URL(apnsUrl);
      const postData = JSON.stringify(payload);

      const client = http2.connect(`https://${url.hostname}`, {
        rejectUnauthorized: true,
      });

      client.on('error', (error) => {
        console.error('❌ Erro na conexão HTTP/2:', error);
        client.close();
        reject(error);
      });

      const req = client.request({
        ':method': 'POST',
        ':path': url.pathname,
        'Authorization': `Bearer ${authToken}`,
        'apns-topic': bundleId,
        'apns-priority': '10',
        'apns-push-type': 'alert',
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(postData)),
      });

      let data = '';
      let responseHeaders: any = {};
      let statusCode = 0;
      
      req.on('response', (headers) => {
        responseHeaders = headers;
        const status = headers[':status'];
        statusCode = typeof status === 'string' ? parseInt(status, 10) : (status || 0);
        console.log(`📡 Status da resposta: ${statusCode}`);
        console.log(`📋 Headers da resposta:`, headers);
      });

      req.on('data', (chunk) => {
        data += chunk.toString();
      });

      req.on('end', () => {
        console.log(`📦 Dados recebidos (${data.length} bytes):`, data.substring(0, 200));
        
        let parsedData: any = {};
        try {
          parsedData = data ? JSON.parse(data) : {};
        } catch {
          parsedData = { raw: data };
        }
        
        resolve({
          statusCode,
          data: parsedData,
          headers: responseHeaders,
        });
        
        client.close();
      });

      req.on('error', (error) => {
        console.error('❌ Erro na requisição HTTP/2:', error);
        client.close();
        reject(error);
      });

      req.setTimeout(10000, () => {
        req.close();
        client.close();
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
 * Inicializar Firebase Admin SDK (chamado uma vez no início)
 */
let firebaseInitialized = false;

function initializeFirebase(): void {
  if (firebaseInitialized) {
    return;
  }

  try {
    // Priorizar variáveis de ambiente (produção)
    if (
      FIREBASE_CONFIG.PROJECT_ID &&
      FIREBASE_CONFIG.PRIVATE_KEY &&
      FIREBASE_CONFIG.CLIENT_EMAIL
    ) {
      console.log('📋 Inicializando Firebase Admin SDK via variáveis de ambiente...');
      
      // Normalizar a chave privada - garantir que tenha quebras de linha corretas
      let privateKey = FIREBASE_CONFIG.PRIVATE_KEY || '';
      
      console.log('🔍 Chave privada recebida (primeiros 50 chars):', privateKey.substring(0, 50));
      console.log('🔍 Chave privada tem \\n literal?', privateKey.includes('\\n'));
      console.log('🔍 Chave privada tem quebra de linha real?', privateKey.includes('\n'));
      
      // Substituir diferentes formatos de quebras de linha
      // 1. \n literal (string)
      privateKey = privateKey.replace(/\\n/g, '\n');
      // 2. \\n (duplo escape)
      privateKey = privateKey.replace(/\\\\n/g, '\n');
      // 3. Quebras de linha já existentes (manter)
      
      // Verificar se a chave está corretamente formatada
      const hasBegin = privateKey.includes('-----BEGIN PRIVATE KEY-----');
      const hasEnd = privateKey.includes('-----END PRIVATE KEY-----');
      
      if (!hasBegin || !hasEnd) {
        console.error('❌ Chave privada inválida:');
        console.error('   Tem BEGIN?', hasBegin);
        console.error('   Tem END?', hasEnd);
        console.error('   Comprimento total:', privateKey.length);
        console.error('   Primeiros 150 caracteres:', privateKey.substring(0, 150));
        console.error('   Últimos 50 caracteres:', privateKey.substring(Math.max(0, privateKey.length - 50)));
        return;
      }
      
      console.log('✅ Chave privada formatada corretamente');
      
      const serviceAccount = {
        type: 'service_account',
        project_id: FIREBASE_CONFIG.PROJECT_ID,
        private_key_id: FIREBASE_CONFIG.PRIVATE_KEY_ID,
        private_key: privateKey,
        client_email: FIREBASE_CONFIG.CLIENT_EMAIL,
        client_id: FIREBASE_CONFIG.CLIENT_ID,
        auth_uri: FIREBASE_CONFIG.AUTH_URI,
        token_uri: FIREBASE_CONFIG.TOKEN_URI,
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: FIREBASE_CONFIG.CLIENT_X509_CERT_URL,
      };

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      });

      firebaseInitialized = true;
      console.log('✅ Firebase Admin SDK inicializado com sucesso (via variáveis de ambiente)');
      return;
    }

    // Fallback: tentar usar arquivo JSON (desenvolvimento)
    console.log('📋 Tentando inicializar Firebase Admin SDK via arquivo JSON...');
    const serviceAccountPath = path.isAbsolute(FIREBASE_CONFIG.SERVICE_ACCOUNT_PATH)
      ? FIREBASE_CONFIG.SERVICE_ACCOUNT_PATH
      : path.join(__dirname, '../../', FIREBASE_CONFIG.SERVICE_ACCOUNT_PATH);

    if (!fs.existsSync(serviceAccountPath)) {
      console.warn(`⚠️ Arquivo Firebase Service Account não encontrado: ${serviceAccountPath}`);
      console.warn('   As notificações Android não funcionarão sem este arquivo.');
      console.warn('   Configure as variáveis de ambiente FIREBASE_* ou coloque o arquivo no caminho correto.');
      return;
    }

    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });

    firebaseInitialized = true;
    console.log('✅ Firebase Admin SDK inicializado com sucesso (via arquivo JSON)');
  } catch (error) {
    console.error('❌ Erro ao inicializar Firebase Admin SDK:', error);
  }
}

/**
 * Enviar notificação via FCM (Android)
 */
export async function sendFCMNotification(
  deviceToken: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  // Inicializar Firebase se ainda não foi inicializado
  if (!firebaseInitialized) {
    initializeFirebase();
  }

  if (!firebaseInitialized) {
    throw new Error('Firebase Admin SDK não foi inicializado. Verifique o arquivo de credenciais.');
  }

  try {
    // Construir payload de dados (sempre incluir, mesmo se vazio)
    const messageData: Record<string, string> = {
      type: 'promotional',
      ...(data
        ? Object.entries(data).reduce((acc, [key, value]) => {
            acc[key] = String(value);
            return acc;
          }, {} as Record<string, string>)
        : {}),
    };

    const message: admin.messaging.Message = {
      token: deviceToken,
      notification: {
        title,
        body,
      },
      data: messageData,
      android: {
        priority: 'high' as const,
        notification: {
          sound: 'default',
          channelId: 'clerky_notifications',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK', // Manter compatibilidade
        },
        ttl: 3600000, // 1 hora
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    console.log(`📤 Enviando FCM para token: ${deviceToken.substring(0, 20)}...`);
    console.log(`   Título: ${title}`);
    console.log(`   Corpo: ${body}`);
    
    const response = await admin.messaging().send(message);
    console.log(`✅ Notificação FCM enviada com sucesso. Message ID: ${response}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error(`❌ Erro ao enviar notificação FCM: ${errorMessage}`);

    // Tratar erros específicos do FCM
    // Verificar se o erro tem a propriedade 'code' (característica dos erros do Firebase Admin SDK)
    if (error && typeof error === 'object' && 'code' in error) {
      const errorCode = (error as any).code;
      if (errorCode === 'messaging/invalid-registration-token' || 
          errorCode === 'messaging/registration-token-not-registered') {
        throw new Error(`Token FCM inválido: ${errorMessage}`);
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
  payload: APNsPayload,
  platform?: 'ios' | 'android'
): Promise<number> {
  const query: any = { userId: userId as any, isActive: true };
  if (platform) {
    query.platform = platform;
  }
  
  const devices = await DeviceToken.find(query);

  let successCount = 0;
  const errors: string[] = [];

  for (const device of devices) {
    try {
      if (device.platform === 'android') {
        // Enviar via FCM para Android
        const title = payload.aps?.alert?.title || payload.aps?.alert?.body || 'Clerky';
        const body = payload.aps?.alert?.body || '';
        // Criar payload customizado sem aps
        const customData: Record<string, any> = {};
        Object.keys(payload).forEach(key => {
          if (key !== 'aps') {
            customData[key] = payload[key];
          }
        });

        await sendFCMNotification(device.deviceToken, title, body, customData);
      } else {
        // Enviar via APNs para iOS
        await sendPushNotification(device.deviceToken, payload, device.isProduction ?? true);
      }
      successCount++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      errors.push(`Device ${device.deviceToken.substring(0, 20)}...: ${errorMessage}`);

      // Se o token for inválido, marcar como inativo
      if (
        errorMessage.includes('BadDeviceToken') || 
        errorMessage.includes('Unregistered') ||
        errorMessage.includes('invalid-registration-token') ||
        errorMessage.includes('registration-token-not-registered')
      ) {
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
  }
  // Se não especificar plataforma, enviar para todas (iOS e Android)

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
      if (device.platform === 'android') {
        // Enviar via FCM para Android
        await sendFCMNotification(
          device.deviceToken,
          title,
          body,
          { type: 'promotional', ...data }
        );
      } else {
        // Enviar via APNs para iOS
        await sendPushNotification(
          device.deviceToken,
          payload,
          device.isProduction ?? true
        );
      }
      successCount++;
    } catch (error) {
      failedCount++;
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      errors.push(`Device ${device.deviceToken.substring(0, 20)}...: ${errorMessage}`);

      // Se o token for inválido, marcar como inativo
      if (
        errorMessage.includes('BadDeviceToken') || 
        errorMessage.includes('Unregistered') ||
        errorMessage.includes('invalid-registration-token') ||
        errorMessage.includes('registration-token-not-registered')
      ) {
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

