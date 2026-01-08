-- Migration: Criar tabelas para movimentação de grupos e mensagens automáticas
-- Este arquivo cria a estrutura para rastrear entrada/saída de participantes e configurar mensagens automáticas

-- ============================================
-- TABELA: group_movements
-- Armazena histórico de entrada e saída de participantes dos grupos
-- ============================================
CREATE TABLE IF NOT EXISTS group_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  instance_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  group_id VARCHAR(255) NOT NULL, -- ID do grupo do WhatsApp (ex: 120363404947352506@g.us)
  group_name VARCHAR(255), -- Nome do grupo (pode ser NULL se não disponível)
  contact_phone VARCHAR(20) NOT NULL, -- Número do contato (normalizado)
  contact_name VARCHAR(255), -- Nome do contato (pode ser NULL)
  movement_type VARCHAR(10) NOT NULL CHECK (movement_type IN ('entered', 'left')), -- Tipo de movimentação
  author_phone VARCHAR(20), -- Quem adicionou/removeu (pode ser NULL)
  timestamp TIMESTAMP NOT NULL, -- Timestamp do evento do WhatsApp
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_group_movements_user_id
ON group_movements(user_id);

CREATE INDEX IF NOT EXISTS idx_group_movements_instance_id
ON group_movements(instance_id);

CREATE INDEX IF NOT EXISTS idx_group_movements_group_id
ON group_movements(group_id);

CREATE INDEX IF NOT EXISTS idx_group_movements_contact_phone
ON group_movements(contact_phone);

CREATE INDEX IF NOT EXISTS idx_group_movements_movement_type
ON group_movements(movement_type);

CREATE INDEX IF NOT EXISTS idx_group_movements_timestamp
ON group_movements(timestamp DESC);

-- Índice composto para busca por grupo e período
CREATE INDEX IF NOT EXISTS idx_group_movements_group_timestamp
ON group_movements(group_id, timestamp DESC);

-- Índice composto para busca por usuário e período
CREATE INDEX IF NOT EXISTS idx_group_movements_user_timestamp
ON group_movements(user_id, timestamp DESC);

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS trigger_update_group_movements_updated_at ON group_movements;
CREATE TRIGGER trigger_update_group_movements_updated_at
BEFORE UPDATE ON group_movements
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABELA: group_auto_messages
-- Armazena configurações de mensagens automáticas (global e por grupo)
-- ============================================
CREATE TABLE IF NOT EXISTS group_auto_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  group_id VARCHAR(255), -- NULL para configuração global, ou ID do grupo para override
  welcome_enabled BOOLEAN DEFAULT FALSE, -- Ativar mensagem de boas-vindas
  welcome_message TEXT, -- Mensagem de boas-vindas (com variáveis)
  welcome_delay_seconds INTEGER DEFAULT 0 CHECK (welcome_delay_seconds >= 0), -- Delay antes de enviar mensagem de boas-vindas
  goodbye_enabled BOOLEAN DEFAULT FALSE, -- Ativar mensagem de despedida
  goodbye_message TEXT, -- Mensagem de despedida (com variáveis)
  goodbye_delay_seconds INTEGER DEFAULT 0 CHECK (goodbye_delay_seconds >= 0), -- Delay antes de enviar mensagem de despedida
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Constraint: Um usuário só pode ter uma configuração global e uma por grupo
  CONSTRAINT unique_user_global_config UNIQUE (user_id, group_id) DEFERRABLE INITIALLY DEFERRED
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_group_auto_messages_user_id
ON group_auto_messages(user_id);

CREATE INDEX IF NOT EXISTS idx_group_auto_messages_group_id
ON group_auto_messages(group_id);

-- Índice composto para buscar configuração de um grupo específico
CREATE INDEX IF NOT EXISTS idx_group_auto_messages_user_group
ON group_auto_messages(user_id, group_id);

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS trigger_update_group_auto_messages_updated_at ON group_auto_messages;
CREATE TRIGGER trigger_update_group_auto_messages_updated_at
BEFORE UPDATE ON group_auto_messages
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Comentários para documentação
COMMENT ON TABLE group_movements IS 'Histórico de entrada e saída de participantes dos grupos do WhatsApp';
COMMENT ON TABLE group_auto_messages IS 'Configurações de mensagens automáticas de boas-vindas e despedida para grupos';
COMMENT ON COLUMN group_auto_messages.group_id IS 'NULL para configuração global, ou ID do grupo para override específico';
