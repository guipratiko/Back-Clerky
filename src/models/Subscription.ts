import mongoose, { Document, Schema } from 'mongoose';

export interface ISubscription extends Document {
  userId: mongoose.Types.ObjectId;
  source: 'apple' | 'appmax' | 'google'; // Origem da assinatura
  productId: string; // ID do produto (ex: com.br.clerky.clerky.premium.test.m1)
  transactionId: string; // ID da transação (único)
  originalTransactionId?: string; // ID da transação original (para renovações)
  status: 'active' | 'expired' | 'cancelled' | 'refunded'; // Status da assinatura
  expiresAt: Date; // Data de expiração
  purchasedAt: Date; // Data de compra
  cancelledAt?: Date; // Data de cancelamento
  // Campos normalizados com AppMax
  email?: string;
  name?: string;
  cpf?: string;
  phone?: string;
  amount?: number; // Valor pago
  // Dados adicionais da Apple
  receiptData?: string; // Receipt completo (base64)
  environment?: 'Sandbox' | 'Production'; // Ambiente da compra
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Usuário é obrigatório'],
      index: true,
    },
    source: {
      type: String,
      enum: ['apple', 'appmax', 'google'],
      required: [true, 'Origem da assinatura é obrigatória'],
    },
    productId: {
      type: String,
      required: [true, 'ID do produto é obrigatório'],
      index: true,
    },
    transactionId: {
      type: String,
      required: [true, 'ID da transação é obrigatório'],
      unique: true,
      index: true,
    },
    originalTransactionId: {
      type: String,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled', 'refunded'],
      required: [true, 'Status é obrigatório'],
      default: 'active',
      index: true,
    },
    expiresAt: {
      type: Date,
      required: [true, 'Data de expiração é obrigatória'],
      index: true,
    },
    purchasedAt: {
      type: Date,
      required: [true, 'Data de compra é obrigatória'],
      default: Date.now,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    // Campos normalizados
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
    cpf: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    amount: {
      type: Number,
    },
    // Dados adicionais da Apple
    receiptData: {
      type: String,
      select: false, // Não retornar por padrão
    },
    environment: {
      type: String,
      enum: ['Sandbox', 'Production'],
    },
  },
  {
    timestamps: true,
  }
);

// Índices compostos
SubscriptionSchema.index({ userId: 1, status: 1 });
SubscriptionSchema.index({ userId: 1, expiresAt: 1 });
SubscriptionSchema.index({ transactionId: 1, source: 1 });

export default mongoose.model<ISubscription>('Subscription', SubscriptionSchema);

