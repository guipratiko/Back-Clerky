import axios from 'axios';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import Subscription, { ISubscription } from '../models/Subscription';
import User from '../models/User';

interface AppleReceiptValidationResponse {
  status: number;
  environment: 'Sandbox' | 'Production';
  receipt: {
    receipt_type: string;
    bundle_id: string;
    in_app: Array<{
      transaction_id: string;
      original_transaction_id: string;
      product_id: string;
      purchase_date_ms: string;
      expires_date_ms?: string;
      cancellation_date_ms?: string;
      is_trial_period?: string;
    }>;
  };
  latest_receipt_info?: Array<{
    transaction_id: string;
    original_transaction_id: string;
    product_id: string;
    purchase_date_ms: string;
    expires_date_ms?: string;
    cancellation_date_ms?: string;
    is_trial_period?: string;
  }>;
}

interface ValidateSubscriptionRequest {
  receiptData: string; // Base64 receipt (Apple) ou purchaseToken (Google)
  productId: string;
  userId: string;
  transactionId?: string; // orderId para Google Play
}

interface ValidateGoogleSubscriptionRequest {
  purchaseToken: string;
  productId: string;
  userId: string;
  orderId: string;
}

/**
 * Validar receipt da Apple
 */
async function validateAppleReceipt(
  receiptData: string,
  isProduction: boolean = true
): Promise<AppleReceiptValidationResponse> {
  const url = isProduction
    ? 'https://buy.itunes.apple.com/verifyReceipt'
    : 'https://sandbox.itunes.apple.com/verifyReceipt';

  try {
    const response = await axios.post<AppleReceiptValidationResponse>(
      url,
      {
        'receipt-data': receiptData,
        password: process.env.APPLE_SHARED_SECRET || '', // Opcional, mas recomendado
        'exclude-old-transactions': false,
      },
      {
        timeout: 10000,
      }
    );

    // Se receber erro 21007 (sandbox receipt enviado para produção), tentar sandbox
    if (response.data.status === 21007 && isProduction) {
      console.log('⚠️ Receipt é do sandbox, tentando validar no sandbox...');
      return validateAppleReceipt(receiptData, false);
    }

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Erro ao validar receipt: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Processar validação de assinatura da Apple
 */
export async function validateAppleSubscription(
  data: ValidateSubscriptionRequest
): Promise<ISubscription> {
  const { receiptData, productId, userId } = data;

  // Validar receipt com a Apple
  const validationResult = await validateAppleReceipt(receiptData);

  if (validationResult.status !== 0) {
    throw new Error(`Receipt inválido. Status: ${validationResult.status}`);
  }

  // Buscar a transação mais recente do produto
  const latestReceiptInfo = validationResult.latest_receipt_info || validationResult.receipt.in_app;
  const transaction = latestReceiptInfo
    .filter((t) => t.product_id === productId)
    .sort((a, b) => parseInt(b.purchase_date_ms) - parseInt(a.purchase_date_ms))[0];

  if (!transaction) {
    throw new Error(`Transação não encontrada para o produto ${productId}`);
  }

  // Calcular data de expiração (1 mês após compra)
  const purchaseDate = new Date(parseInt(transaction.purchase_date_ms));
  const expiresDate = transaction.expires_date_ms
    ? new Date(parseInt(transaction.expires_date_ms))
    : new Date(purchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 dias

  // Verificar se está cancelada
  const isCancelled = transaction.cancellation_date_ms !== undefined;
  const status = isCancelled
    ? 'cancelled'
    : expiresDate < new Date()
    ? 'expired'
    : 'active';

  // Buscar ou criar assinatura
  let subscription = await Subscription.findOne({
    transactionId: transaction.transaction_id,
    source: 'apple',
  });

  const subscriptionData = {
    userId: userId as any,
    source: 'apple' as const,
    productId: transaction.product_id,
    transactionId: transaction.transaction_id,
    originalTransactionId: transaction.original_transaction_id,
    status: status as 'active' | 'expired' | 'cancelled' | 'refunded',
    expiresAt: expiresDate,
    purchasedAt: purchaseDate,
    cancelledAt: isCancelled ? new Date(parseInt(transaction.cancellation_date_ms!)) : undefined,
    receiptData: receiptData,
    environment: validationResult.environment,
  };

  if (subscription) {
    // Atualizar assinatura existente
    Object.assign(subscription, subscriptionData);
    await subscription.save();
  } else {
    // Criar nova assinatura
    subscription = await Subscription.create(subscriptionData);
  }

  // Atualizar isPremium do usuário
  const user = await User.findById(userId);
  if (user) {
    user.isPremium = status === 'active';
    await user.save();
  }

  return subscription;
}

/**
 * Validar assinatura do Google Play
 */
export async function validateGoogleSubscription(
  data: ValidateGoogleSubscriptionRequest
): Promise<ISubscription> {
  const { purchaseToken, productId, userId, orderId } = data;
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.clerky.android';

  try {
    // Se tiver service account configurado, usar Google Play Developer API
    if (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PATH) {
      return await validateGoogleSubscriptionWithAPI(data, packageName);
    } else {
      // Validação básica sem API (confia no token do cliente)
      // Em produção, sempre usar a API
      console.warn('⚠️ Google Play Service Account não configurado. Usando validação básica.');
      return await validateGoogleSubscriptionBasic(data);
    }
  } catch (error: any) {
    console.error('Erro ao validar assinatura Google Play:', error);
    // Se o erro for de decodificação da chave, sugerir usar arquivo
    if (error.code === 'ERR_OSSL_UNSUPPORTED' || error.message?.includes('DECODER')) {
      console.error('💡 Dica: O formato da chave privada no .env pode estar incorreto.');
      console.error('   Use GOOGLE_PLAY_SERVICE_ACCOUNT_PATH apontando para o arquivo JSON ao invés de GOOGLE_PLAY_SERVICE_ACCOUNT_KEY.');
      throw new Error('Erro ao processar chave da Service Account. Use GOOGLE_PLAY_SERVICE_ACCOUNT_PATH com caminho do arquivo JSON.');
    }
    throw new Error(`Erro ao validar assinatura Google Play: ${error.message}`);
  }
}

/**
 * Validar usando Google Play Developer API (recomendado)
 */
async function validateGoogleSubscriptionWithAPI(
  data: ValidateGoogleSubscriptionRequest,
  packageName: string
): Promise<ISubscription> {
  const { purchaseToken, productId, userId, orderId } = data;

  try {
    let serviceAccountKey: any;
    
    // Tentar carregar de arquivo primeiro (mais confiável)
    if (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PATH) {
      const filePath = path.resolve(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PATH);
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        serviceAccountKey = JSON.parse(fileContent);
        console.log('✅ Service Account carregada de arquivo:', filePath);
      } else {
        throw new Error(`Arquivo da Service Account não encontrado: ${filePath}`);
      }
    } else if (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY) {
      // Tentar parsear da variável de ambiente
      try {
        serviceAccountKey = JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY);
      } catch (parseError: any) {
        throw new Error(`Erro ao parsear GOOGLE_PLAY_SERVICE_ACCOUNT_KEY: ${parseError.message}. Use GOOGLE_PLAY_SERVICE_ACCOUNT_PATH com caminho do arquivo JSON.`);
      }
    } else {
      throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_KEY ou GOOGLE_PLAY_SERVICE_ACCOUNT_PATH não configurado');
    }
    
    // Criar cliente autenticado
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountKey,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });

    const authClient = await auth.getClient();
    const androidpublisher = google.androidpublisher({
      version: 'v3',
      auth: authClient as any,
    });

    // Validar subscription
    const response = await androidpublisher.purchases.subscriptions.get({
      packageName: packageName,
      subscriptionId: productId,
      token: purchaseToken,
    });

    const subscriptionPurchase = response.data;

    if (!subscriptionPurchase) {
      throw new Error('Resposta inválida da API do Google Play');
    }

    // Verificar status da assinatura
    const paymentState = subscriptionPurchase.paymentState;
    const expiryTimeMillis = subscriptionPurchase.expiryTimeMillis;

    if (!expiryTimeMillis) {
      throw new Error('Data de expiração não encontrada');
    }

    const expiresDate = new Date(parseInt(expiryTimeMillis));
    const purchaseDate = subscriptionPurchase.startTimeMillis 
      ? new Date(parseInt(subscriptionPurchase.startTimeMillis))
      : new Date();

    // Payment state: 0 = payment pending, 1 = payment received, 2 = free trial, 3 = pending deferred
    // Cancel reason: 0 = user, 1 = system, 2 = replaced, 3 = developer
    const cancelReason = subscriptionPurchase.cancelReason;
    const autoRenewing = subscriptionPurchase.autoRenewing === true;

    let status: 'active' | 'expired' | 'cancelled' | 'refunded' = 'active';
    
    if (cancelReason !== undefined && cancelReason !== null) {
      status = 'cancelled';
    } else if (expiresDate < new Date()) {
      status = 'expired';
    } else if (paymentState === 1 || paymentState === 2) {
      status = 'active';
    }

    // Buscar ou criar assinatura
    let subscription = await Subscription.findOne({
      transactionId: orderId,
      source: 'google',
    });

    const subscriptionData = {
      userId: userId as any,
      source: 'google' as const,
      productId: productId,
      transactionId: orderId,
      originalTransactionId: orderId, // Para Google Play, orderId é a transação original
      status: status,
      expiresAt: expiresDate,
      purchasedAt: purchaseDate,
      cancelledAt: cancelReason !== undefined && cancelReason !== null ? new Date() : undefined,
      receiptData: purchaseToken,
      environment: 'Production' as const,
    };

    if (subscription) {
      Object.assign(subscription, subscriptionData);
      await subscription.save();
    } else {
      subscription = await Subscription.create(subscriptionData);
    }

    // Atualizar isPremium do usuário
    const user = await User.findById(userId);
    if (user) {
      user.isPremium = status === 'active';
      await user.save();
    }

    return subscription;
  } catch (error: any) {
    if (error.code === 410) {
      // Subscription token expired or invalid
      throw new Error('Token de assinatura expirado ou inválido');
    }
    throw error;
  }
}

/**
 * Validação básica sem API (apenas para desenvolvimento/testes)
 * Em produção, sempre usar validateGoogleSubscriptionWithAPI
 */
async function validateGoogleSubscriptionBasic(
  data: ValidateGoogleSubscriptionRequest
): Promise<ISubscription> {
  const { purchaseToken, productId, userId, orderId } = data;

  // Validação básica: assume que a compra é válida e cria assinatura
  // Data de expiração: +30 dias da data atual (para subscriptions mensais)
  const purchaseDate = new Date();
  const expiresDate = new Date(purchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Buscar ou criar assinatura
  let subscription = await Subscription.findOne({
    transactionId: orderId,
    source: 'google',
  });

  const subscriptionData = {
    userId: userId as any,
    source: 'google' as const,
    productId: productId,
    transactionId: orderId,
    originalTransactionId: orderId,
    status: 'active' as const,
    expiresAt: expiresDate,
    purchasedAt: purchaseDate,
    receiptData: purchaseToken,
    environment: 'Production' as const,
  };

  if (subscription) {
    Object.assign(subscription, subscriptionData);
    await subscription.save();
  } else {
    subscription = await Subscription.create(subscriptionData);
  }

  // Atualizar isPremium do usuário
  const user = await User.findById(userId);
  if (user) {
    user.isPremium = true;
    await user.save();
  }

  return subscription;
}

/**
 * Obter assinatura ativa do usuário
 */
export async function getActiveSubscription(userId: string): Promise<ISubscription | null> {
  return Subscription.findOne({
    userId: userId as any,
    status: 'active',
    expiresAt: { $gt: new Date() },
  }).sort({ expiresAt: -1 });
}

/**
 * Verificar e atualizar status de assinaturas expiradas
 */
export async function checkExpiredSubscriptions(): Promise<void> {
  const expiredSubscriptions = await Subscription.find({
    status: 'active',
    expiresAt: { $lte: new Date() },
  });

  for (const subscription of expiredSubscriptions) {
    subscription.status = 'expired';
    await subscription.save();

    // Atualizar isPremium do usuário se não houver outras assinaturas ativas
    const hasOtherActive = await Subscription.findOne({
      userId: subscription.userId,
      status: 'active',
      expiresAt: { $gt: new Date() },
      _id: { $ne: subscription._id },
    });

    if (!hasOtherActive) {
      const user = await User.findById(subscription.userId);
      if (user) {
        user.isPremium = false;
        await user.save();
      }
    }
  }
}

