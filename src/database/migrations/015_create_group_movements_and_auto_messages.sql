-- Migration: Criar tabelas para movimentações de grupos e mensagens automáticas
-- Este arquivo cria a estrutura para rastrear entradas/saídas de grupos e configurar mensagens automáticas

-- ============================================
-- TABELA: group_movements
-- Armazena histórico de entradas e saídas de participantes em grupos
-- ============================================
-- Dropar tabela se existir (para garantir estrutura correta)
DROP TABLE IF EXISTS group_movements CASCADE;

CREATE TABLE group_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  instance_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  group_id VARCHAR(255) NOT NULL, -- ID do grupo (groupJid)
  group_name VARCHAR(255), -- Nome do grupo (pode mudar)
  participant_id VARCHAR(255) NOT NULL, -- ID do participante (remoteJid)
  participant_phone VARCHAR(20), -- Telefone formatado do participante
  participant_name VARCHAR(255), -- Nome do participante
  movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('join', 'leave', 'promote', 'demote')), -- Tipo de movimentação
  is_admin BOOLEAN DEFAULT FALSE, -- Se o participante é admin (após a movimentação)
  action_by VARCHAR(255), -- Quem realizou a ação (se foi ação de outro participante)
  action_by_phone VARCHAR(20), -- Telefone de quem realizou a ação
  action_by_name VARCHAR(255), -- Nome de quem realizou a ação
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_group_movements_user_id ON group_movements(user_id);
CREATE INDEX IF NOT EXISTS idx_group_movements_instance_id ON group_movements(instance_id);
CREATE INDEX IF NOT EXISTS idx_group_movements_group_id ON group_movements(group_id);
CREATE INDEX IF NOT EXISTS idx_group_movements_participant_id ON group_movements(participant_id);
CREATE INDEX IF NOT EXISTS idx_group_movements_movement_type ON group_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_group_movements_created_at ON group_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_movements_user_group ON group_movements(user_id, group_id);

-- ============================================
-- TABELA: group_auto_messages
-- Armazena configurações de mensagens automáticas para grupos
-- ============================================
-- Dropar tabela se existir (para garantir estrutura correta)
DROP TABLE IF EXISTS group_auto_messages CASCADE;

CREATE TABLE group_auto_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  instance_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  group_id VARCHAR(255), -- ID do grupo específico (NULL = aplicar a todos os grupos da instância)
  is_active BOOLEAN DEFAULT TRUE, -- Se a mensagem automática está ativa
  message_type VARCHAR(20) NOT NULL CHECK (message_type IN ('welcome', 'goodbye')), -- Tipo de mensagem
  message_text TEXT NOT NULL, -- Texto da mensagem (suporta variáveis como {name}, {group}, etc.)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Constraint: Um usuário não pode ter duas mensagens do mesmo tipo para o mesmo grupo
-- PostgreSQL trata NULL como valores distintos, então podemos ter múltiplas mensagens globais
-- Mas queremos garantir que não haja duplicatas para o mesmo grupo
-- Criar índice único parcial para grupos específicos
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_auto_messages_specific_unique 
ON group_auto_messages(user_id, instance_id, group_id, message_type)
WHERE group_id IS NOT NULL;

-- Para mensagens globais, permitir apenas uma por tipo por instância
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_auto_messages_global_unique 
ON group_auto_messages(user_id, instance_id, message_type)
WHERE group_id IS NULL;

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_group_auto_messages_user_id ON group_auto_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_group_auto_messages_instance_id ON group_auto_messages(instance_id);
CREATE INDEX IF NOT EXISTS idx_group_auto_messages_group_id ON group_auto_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_auto_messages_message_type ON group_auto_messages(message_type);
CREATE INDEX IF NOT EXISTS idx_group_auto_messages_is_active ON group_auto_messages(is_active);
CREATE INDEX IF NOT EXISTS idx_group_auto_messages_user_instance ON group_auto_messages(user_id, instance_id);

-- ============================================
-- COMENTÁRIOS
-- ============================================
COMMENT ON TABLE group_movements IS 'Histórico de movimentações de participantes em grupos (entrada, saída, promoção, etc.)';
COMMENT ON TABLE group_auto_messages IS 'Configurações de mensagens automáticas para grupos (boas-vindas e despedida)';

COMMENT ON COLUMN group_movements.movement_type IS 'Tipo de movimentação: join (entrada), leave (saída), promote (promovido a admin), demote (removido de admin)';
COMMENT ON COLUMN group_movements.is_admin IS 'Se o participante é admin após a movimentação';
COMMENT ON COLUMN group_movements.action_by IS 'ID de quem realizou a ação (se foi ação de outro participante, ex: admin que adicionou alguém)';
COMMENT ON COLUMN group_auto_messages.group_id IS 'ID do grupo específico (NULL = aplicar a todos os grupos da instância)';
COMMENT ON COLUMN group_auto_messages.message_type IS 'Tipo de mensagem: welcome (boas-vindas ao entrar), goodbye (despedida ao sair)';
COMMENT ON COLUMN group_auto_messages.message_text IS 'Texto da mensagem com suporte a variáveis: {name} (nome do participante), {group} (nome do grupo), {phone} (telefone)';
