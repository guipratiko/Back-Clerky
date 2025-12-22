import mongoose, { Document, Schema } from 'mongoose';
import { generateInstanceToken } from '../utils/tokenGenerator';

export interface IInstance extends Document {
  instanceName: string; // Nome interno gerado automaticamente
  name: string; // Nome escolhido pelo usuário (apenas para exibição)
  userId: mongoose.Types.ObjectId;
  token?: string;
  qrcode: boolean;
  integration: string;
  rejectCall: boolean;
  groupsIgnore: boolean;
  alwaysOnline: boolean;
  readMessages: boolean;
  readStatus: boolean;
  syncFullHistory: boolean;
  webhook: {
    url: string;
    byEvents: boolean;
    base64: boolean;
    headers?: {
      authorization?: string;
      'Content-Type'?: string;
    };
    events: {
      MESSAGES_DELETE?: boolean;
      MESSAGES_UPSERT?: boolean;
      QRCODE_UPDATED?: boolean;
    };
  };
  qrcodeBase64?: string;
  instanceId?: string;
  hash?: string;
  status: 'created' | 'connecting' | 'connected' | 'disconnected' | 'error';
  createdAt: Date;
  updatedAt: Date;
}

const InstanceSchema: Schema = new Schema(
  {
    instanceName: {
      type: String,
      required: [true, 'Nome da instância é obrigatório'],
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Nome da instância é obrigatório'],
      trim: true,
      minlength: [3, 'Nome deve ter no mínimo 3 caracteres'],
      maxlength: [50, 'Nome deve ter no máximo 50 caracteres'],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Usuário é obrigatório'],
    },
    token: {
      type: String,
      required: true,
      unique: true,
      default: () => generateInstanceToken(),
    },
    qrcode: {
      type: Boolean,
      default: true,
    },
    integration: {
      type: String,
      default: 'WHATSAPP-BAILEYS',
    },
    rejectCall: {
      type: Boolean,
      default: false,
    },
    groupsIgnore: {
      type: Boolean,
      default: false,
    },
    alwaysOnline: {
      type: Boolean,
      default: false,
    },
    readMessages: {
      type: Boolean,
      default: false,
    },
    readStatus: {
      type: Boolean,
      default: false,
    },
    syncFullHistory: {
      type: Boolean,
      default: true,
    },
    webhook: {
      url: {
        type: String,
        required: true,
      },
      byEvents: {
        type: Boolean,
        default: false,
      },
      base64: {
        type: Boolean,
        default: true,
      },
      headers: {
        authorization: String,
        'Content-Type': {
          type: String,
          default: 'application/json',
        },
      },
      events: {
        MESSAGES_DELETE: {
          type: Boolean,
          default: false,
        },
        MESSAGES_UPSERT: {
          type: Boolean,
          default: false,
        },
        QRCODE_UPDATED: {
          type: Boolean,
          default: false,
        },
      },
    },
    qrcodeBase64: {
      type: String,
      default: null,
    },
    instanceId: {
      type: String,
      default: null,
    },
    hash: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['created', 'connecting', 'connected', 'disconnected', 'error'],
      default: 'created',
    },
  },
  {
    timestamps: true,
  }
);

// Hook pre-save para garantir que o token seja sempre gerado
InstanceSchema.pre('save', async function (next) {
  // Se não tiver token, gerar um novo
  if (!this.token || this.token === '') {
    let newToken = generateInstanceToken();
    // Garantir que o token seja único
    const InstanceModel = this.constructor as typeof Instance;
    let existingInstance = await InstanceModel.findOne({ token: newToken });
    while (existingInstance) {
      newToken = generateInstanceToken();
      existingInstance = await InstanceModel.findOne({ token: newToken });
    }
    this.token = newToken;
  }
  next();
});

// Índices para melhor performance
InstanceSchema.index({ userId: 1 });
// token e instanceName já têm índices únicos criados automaticamente pelo unique: true

const Instance = mongoose.model<IInstance>('Instance', InstanceSchema);

export default Instance;

