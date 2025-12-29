import axios from 'axios';
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
  receiptData: string; // Base64 receipt
  productId: string;
  userId: string;
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

