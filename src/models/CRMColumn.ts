import mongoose, { Document, Schema } from 'mongoose';

export interface ICRMColumn extends Document {
  userId: mongoose.Types.ObjectId;
  name: string; // Nome da coluna (personalizável)
  order: number; // Ordem de exibição (0, 1, 2, 3, 4)
  color?: string; // Cor da coluna (opcional, para customização futura)
  createdAt: Date;
  updatedAt: Date;
}

const CRMColumnSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Usuário é obrigatório'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Nome da coluna é obrigatório'],
      trim: true,
      maxlength: [50, 'Nome deve ter no máximo 50 caracteres'],
    },
    order: {
      type: Number,
      required: [true, 'Ordem é obrigatória'],
      min: 0,
      max: 4,
    },
    color: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Índice único por usuário + ordem (uma ordem por usuário)
CRMColumnSchema.index({ userId: 1, order: 1 }, { unique: true });

// Índice único por usuário + nome (um nome por usuário)
CRMColumnSchema.index({ userId: 1, name: 1 }, { unique: true });

const CRMColumn = mongoose.model<ICRMColumn>('CRMColumn', CRMColumnSchema);

export default CRMColumn;






