import mongoose, { Document, Schema } from 'mongoose';

export interface IDeviceToken extends Document {
  userId: mongoose.Types.ObjectId;
  deviceToken: string; // Token do dispositivo (APNs)
  deviceId?: string; // ID único do dispositivo (opcional)
  platform: 'ios' | 'android'; // Plataforma
  isProduction?: boolean; // Se é ambiente de produção
  isActive: boolean; // Se o token está ativo
  appVersion?: string; // Versão do app
  createdAt: Date;
  updatedAt: Date;
}

const DeviceTokenSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Usuário é obrigatório'],
      index: true,
    },
    deviceToken: {
      type: String,
      required: [true, 'Token do dispositivo é obrigatório'],
      unique: true,
      index: true,
    },
    deviceId: {
      type: String,
      index: true,
    },
    platform: {
      type: String,
      enum: ['ios', 'android'],
      required: [true, 'Plataforma é obrigatória'],
      default: 'ios',
    },
    isProduction: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    appVersion: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Índice composto
DeviceTokenSchema.index({ userId: 1, isActive: 1 });

export default mongoose.model<IDeviceToken>('DeviceToken', DeviceTokenSchema);

