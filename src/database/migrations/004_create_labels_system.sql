-- Migration: Criar sistema de etiquetas (labels) para contatos
-- Cada usuário pode ter até 5 labels configuráveis com cores vibrantes

-- Tabela de Labels
CREATE TABLE IF NOT EXISTS labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  name VARCHAR(50) NOT NULL,
  color VARCHAR(7) NOT NULL, -- Código hexadecimal da cor (ex: #FF5733)
  order_index INTEGER NOT NULL CHECK (order_index >= 0 AND order_index <= 4), -- 0 a 4 (5 labels)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Constraint: Um usuário não pode ter duas labels com a mesma ordem
CREATE UNIQUE INDEX IF NOT EXISTS idx_labels_user_order
ON labels(user_id, order_index);

-- Constraint: Um usuário não pode ter duas labels com o mesmo nome
CREATE UNIQUE INDEX IF NOT EXISTS idx_labels_user_name
ON labels(user_id, name);

-- Índice para busca rápida por usuário
CREATE INDEX IF NOT EXISTS idx_labels_user_id
ON labels(user_id);

-- Tabela de relacionamento many-to-many entre contacts e labels
CREATE TABLE IF NOT EXISTS contact_labels (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (contact_id, label_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_contact_labels_contact_id
ON contact_labels(contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_labels_label_id
ON contact_labels(label_id);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_labels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_labels_updated_at ON labels;
CREATE TRIGGER trigger_update_labels_updated_at
BEFORE UPDATE ON labels
FOR EACH ROW
EXECUTE FUNCTION update_labels_updated_at();

-- Comentários
COMMENT ON TABLE labels IS 'Etiquetas configuráveis pelo usuário para categorizar contatos';
COMMENT ON TABLE contact_labels IS 'Relacionamento many-to-many entre contatos e labels';
COMMENT ON COLUMN labels.order_index IS 'Ordem da label (0-4), permite até 5 labels por usuário';
COMMENT ON COLUMN labels.color IS 'Cor hexadecimal da label (ex: #FF5733)';

