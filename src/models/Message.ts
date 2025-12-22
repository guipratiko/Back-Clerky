import mongoose, { Document, Schema } from 'mongoose';

export interface IMessage extends Document {
  userId: mongoose.Types.ObjectId;
  instanceId: mongoose.Types.ObjectId;
  contactId: mongoose.Types.ObjectId;
  remoteJid: string; // ID completo do WhatsApp
  messageId: string; // ID único da mensagem do WhatsApp
  fromMe: boolean; // Se a mensagem foi enviada por nós
  messageType: string; // Tipo da mensagem (conversation, imageMessage, audioMessage, videoMessage, etc.)
  content: string; // Conteúdo da mensagem (texto ou '[Mídia]' para mídias)
  mediaUrl?: string; // URL completa do arquivo de mídia no MidiaService
  timestamp: Date; // Timestamp da mensagem do WhatsApp
  read: boolean; // Se a mensagem foi lida
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema: Schema = new Schema(
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
    contactId: {
      type: Schema.Types.ObjectId,
      ref: 'Contact',
      required: [true, 'Contato é obrigatório'],
      index: true,
    },
    remoteJid: {
      type: String,
      required: [true, 'RemoteJid é obrigatório'],
      index: true,
    },
    messageId: {
      type: String,
      required: [true, 'MessageId é obrigatório'],
    },
    fromMe: {
      type: Boolean,
      required: true,
      default: false,
    },
    messageType: {
      type: String,
      default: 'conversation',
    },
    content: {
      type: String,
      required: [true, 'Conteúdo é obrigatório'],
    },
    mediaUrl: {
      type: String,
      default: null,
    },
    timestamp: {
      type: Date,
      required: [true, 'Timestamp é obrigatório'],
      index: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Índice único por messageId para evitar duplicatas
MessageSchema.index({ messageId: 1 }, { unique: true });

// Índice composto para buscar mensagens por contato ordenadas por timestamp
MessageSchema.index({ contactId: 1, timestamp: -1 });

const Message = mongoose.model<IMessage>('Message', MessageSchema);

export default Message;

