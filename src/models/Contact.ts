import mongoose, { Document, Schema } from 'mongoose';

export interface IContact extends Document {
  userId: mongoose.Types.ObjectId;
  instanceId: mongoose.Types.ObjectId;
  remoteJid: string; // ID completo do WhatsApp (ex: 556298448536@s.whatsapp.net)
  phone: string; // Telefone formatado (ex: 62 9844-8536)
  name: string; // Nome do contato (pushName)
  profilePicture?: string; // URL da foto de perfil do WhatsApp
  columnId: mongoose.Types.ObjectId; // Coluna do kanban onde está o contato
  unreadCount: number; // Contador de mensagens não lidas
  lastMessage?: string; // Última mensagem recebida
  lastMessageAt?: Date; // Data da última mensagem
  createdAt: Date;
  updatedAt: Date;
}

const ContactSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Usuário é obrigatório'],
      index: true,
    },
    instanceId: {
      type: Schema.Types.ObjectId,
      ref: 'Instance',
      required: [true, 'Instância é obrigatória'],
      index: true,
    },
    remoteJid: {
      type: String,
      required: [true, 'RemoteJid é obrigatório'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Telefone é obrigatório'],
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Nome é obrigatório'],
      trim: true,
      default: 'Sem nome',
    },
    profilePicture: {
      type: String,
      default: null,
    },
    columnId: {
      type: Schema.Types.ObjectId,
      ref: 'CRMColumn',
      required: [true, 'Coluna é obrigatória'],
      index: true,
    },
    unreadCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastMessage: {
      type: String,
      default: null,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Índice único por usuário + instância + remoteJid (um contato por instância)
ContactSchema.index({ userId: 1, instanceId: 1, remoteJid: 1 }, { unique: true });

const Contact = mongoose.model<IContact>('Contact', ContactSchema);

export default Contact;

