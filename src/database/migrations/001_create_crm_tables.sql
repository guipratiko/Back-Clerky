-- Migration: Criar tabelas do CRM (crm_columns, contacts, messages)
-- Este arquivo cria toda a estrutura base do sistema CRM

-- Habilitar extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABELA: crm_columns
-- Armazena as colunas do Kanban do CRM
-- ============================================
CREATE TABLE IF NOT EXISTS crm_columns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  name VARCHAR(50) NOT NULL,
  order_index INTEGER NOT NULL CHECK (order_index >= 0 AND order_index <= 4), -- 0 a 4 (5 colunas)
  color VARCHAR(7), -- Código hexadecimal da cor (ex: #FF5733)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Constraint: Um usuário não pode ter duas colunas com a mesma ordem
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_columns_user_order
ON crm_columns(user_id, order_index);

-- Constraint: Um usuário não pode ter duas colunas com o mesmo nome
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_columns_user_name
ON crm_columns(user_id, name);

-- Índice para busca rápida por usuário
CREATE INDEX IF NOT EXISTS idx_crm_columns_user_id
ON crm_columns(user_id);

-- ============================================
-- TABELA: contacts
-- Armazena os contatos do CRM
-- ============================================
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  instance_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  remote_jid VARCHAR(255) NOT NULL, -- ID completo do WhatsApp (ex: 556298448536@s.whatsapp.net)
  phone VARCHAR(20) NOT NULL, -- Telefone formatado (ex: 62 9844-8536)
  name VARCHAR(255) NOT NULL, -- Nome do contato (pushName)
  profile_picture TEXT, -- URL da foto de perfil
  column_id UUID REFERENCES crm_columns(id) ON DELETE SET NULL, -- FK para crm_columns
  unread_count INTEGER DEFAULT 0 CHECK (unread_count >= 0), -- Contador de mensagens não lidas
  last_message VARCHAR(100), -- Última mensagem (primeiros 100 caracteres)
  last_message_at TIMESTAMP, -- Timestamp da última mensagem
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Constraint: Um contato é único por usuário + instância + remote_jid
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_user_instance_remote_jid
ON contacts(user_id, instance_id, remote_jid);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_contacts_user_id
ON contacts(user_id);

CREATE INDEX IF NOT EXISTS idx_contacts_instance_id
ON contacts(instance_id);

CREATE INDEX IF NOT EXISTS idx_contacts_column_id
ON contacts(column_id);

CREATE INDEX IF NOT EXISTS idx_contacts_remote_jid
ON contacts(remote_jid);

-- Índice para busca full-text (nome e telefone)
CREATE INDEX IF NOT EXISTS idx_contacts_search
ON contacts USING GIN (to_tsvector('portuguese', COALESCE(name, '') || ' ' || COALESCE(phone, '')));

-- Índice para ordenação por última mensagem
CREATE INDEX IF NOT EXISTS idx_contacts_last_message_at
ON contacts(last_message_at DESC NULLS LAST);

-- ============================================
-- TABELA: messages
-- Armazena as mensagens do chat
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  instance_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE, -- FK para contacts
  remote_jid VARCHAR(255) NOT NULL, -- ID completo do WhatsApp
  message_id VARCHAR(255) NOT NULL, -- ID único da mensagem do WhatsApp
  from_me BOOLEAN NOT NULL DEFAULT FALSE, -- Se a mensagem foi enviada por nós
  message_type VARCHAR(50) DEFAULT 'conversation', -- Tipo da mensagem (conversation, imageMessage, audioMessage, videoMessage, etc.)
  content TEXT NOT NULL, -- Conteúdo da mensagem (texto ou '[Mídia]' para mídias)
  media_url TEXT, -- URL completa do arquivo de mídia no MidiaService
  timestamp TIMESTAMP NOT NULL, -- Timestamp da mensagem do WhatsApp
  read BOOLEAN DEFAULT FALSE, -- Se a mensagem foi lida
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Constraint: message_id é único por instância (permite mesmo messageId em instâncias diferentes)
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_message_id_instance_id
ON messages(message_id, instance_id);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_messages_user_id
ON messages(user_id);

CREATE INDEX IF NOT EXISTS idx_messages_instance_id
ON messages(instance_id);

CREATE INDEX IF NOT EXISTS idx_messages_contact_id
ON messages(contact_id);

CREATE INDEX IF NOT EXISTS idx_messages_remote_jid
ON messages(remote_jid);

-- Índice composto para buscar mensagens por contato ordenadas por timestamp
CREATE INDEX IF NOT EXISTS idx_messages_contact_timestamp
ON messages(contact_id, timestamp DESC);

-- ============================================
-- FUNÇÕES E TRIGGERS
-- ============================================

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar updated_at em crm_columns
DROP TRIGGER IF EXISTS trigger_update_crm_columns_updated_at ON crm_columns;
CREATE TRIGGER trigger_update_crm_columns_updated_at
BEFORE UPDATE ON crm_columns
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger para atualizar updated_at em contacts
DROP TRIGGER IF EXISTS trigger_update_contacts_updated_at ON contacts;
CREATE TRIGGER trigger_update_contacts_updated_at
BEFORE UPDATE ON contacts
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger para atualizar updated_at em messages
DROP TRIGGER IF EXISTS trigger_update_messages_updated_at ON messages;
CREATE TRIGGER trigger_update_messages_updated_at
BEFORE UPDATE ON messages
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Função para atualizar last_message e last_message_at do contato
CREATE OR REPLACE FUNCTION update_contact_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE contacts
  SET 
    last_message = LEFT(NEW.content, 100), -- Limitar a 100 caracteres
    last_message_at = NEW.timestamp,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.contact_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar last_message quando uma nova mensagem é inserida
DROP TRIGGER IF EXISTS trigger_update_contact_last_message ON messages;
CREATE TRIGGER trigger_update_contact_last_message
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION update_contact_last_message();

-- Função para incrementar unread_count quando mensagem recebida é inserida
CREATE OR REPLACE FUNCTION increment_unread_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Só incrementa se a mensagem não foi enviada por nós (from_me = FALSE)
  IF NEW.from_me = FALSE THEN
    UPDATE contacts
    SET 
      unread_count = unread_count + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para incrementar unread_count quando mensagem recebida é inserida
DROP TRIGGER IF EXISTS trigger_increment_unread_count ON messages;
CREATE TRIGGER trigger_increment_unread_count
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION increment_unread_count();

-- ============================================
-- COMENTÁRIOS
-- ============================================
COMMENT ON TABLE crm_columns IS 'Colunas do Kanban do CRM (Novos, Em Atendimento, etc.)';
COMMENT ON TABLE contacts IS 'Contatos do WhatsApp gerenciados no CRM';
COMMENT ON TABLE messages IS 'Mensagens do chat do WhatsApp';

COMMENT ON COLUMN crm_columns.order_index IS 'Ordem da coluna (0-4), permite até 5 colunas por usuário';
COMMENT ON COLUMN crm_columns.color IS 'Cor hexadecimal da coluna (ex: #FF5733)';
COMMENT ON COLUMN contacts.remote_jid IS 'ID completo do WhatsApp (ex: 556298448536@s.whatsapp.net)';
COMMENT ON COLUMN contacts.last_message IS 'Última mensagem do contato (limitado a 100 caracteres)';
COMMENT ON COLUMN messages.message_id IS 'ID único da mensagem do WhatsApp (único por instância)';
COMMENT ON COLUMN messages.message_type IS 'Tipo da mensagem: conversation, imageMessage, audioMessage, videoMessage, etc.';
COMMENT ON COLUMN messages.media_url IS 'URL completa do arquivo de mídia no MidiaService';

