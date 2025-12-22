-- Migration: Criar tabelas de Disparos (templates, dispatches, dispatch_jobs)
-- Este arquivo cria toda a estrutura base do sistema de Disparos

-- Habilitar extensão UUID (se ainda não estiver habilitada)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABELA: templates
-- Armazena os templates de mensagens criados pelos usuários
-- ============================================
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  name VARCHAR(255) NOT NULL, -- Nome do template
  type VARCHAR(50) NOT NULL CHECK (type IN ('text', 'image', 'image_caption', 'video', 'video_caption', 'audio', 'file', 'sequence')),
  content JSONB NOT NULL, -- Conteúdo do template (estrutura varia por tipo)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice para busca rápida por usuário
CREATE INDEX IF NOT EXISTS idx_templates_user_id
ON templates(user_id);

-- Índice para busca por tipo
CREATE INDEX IF NOT EXISTS idx_templates_type
ON templates(type);

-- Índice composto para busca por usuário e tipo
CREATE INDEX IF NOT EXISTS idx_templates_user_type
ON templates(user_id, type);

-- Constraint: Um usuário não pode ter dois templates com o mesmo nome
CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_user_name
ON templates(user_id, name);

-- ============================================
-- TABELA: dispatches
-- Armazena os disparos criados pelos usuários
-- ============================================
CREATE TABLE IF NOT EXISTS dispatches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  instance_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB (instância do WhatsApp)
  template_id UUID REFERENCES templates(id) ON DELETE SET NULL, -- FK para templates (pode ser null se for disparo direto)
  name VARCHAR(255) NOT NULL, -- Nome do disparo
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')),
  settings JSONB NOT NULL DEFAULT '{}', -- Configurações: velocidade, exclusão automática, delay, etc.
  schedule JSONB, -- Agendamento: horários, dias suspensos (nullable)
  contacts_data JSONB NOT NULL DEFAULT '[]', -- Contatos selecionados/processados
  stats JSONB NOT NULL DEFAULT '{"sent": 0, "failed": 0, "invalid": 0, "total": 0}', -- Estatísticas do disparo
  default_name VARCHAR(100), -- Nome padrão para personalização quando não houver nome
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP, -- Quando o disparo começou
  completed_at TIMESTAMP -- Quando o disparo foi concluído
);

-- Índice para busca rápida por usuário
CREATE INDEX IF NOT EXISTS idx_dispatches_user_id
ON dispatches(user_id);

-- Índice para busca por status
CREATE INDEX IF NOT EXISTS idx_dispatches_status
ON dispatches(status);

-- Índice para busca por instância
CREATE INDEX IF NOT EXISTS idx_dispatches_instance_id
ON dispatches(instance_id);

-- Índice composto para busca por usuário e status
CREATE INDEX IF NOT EXISTS idx_dispatches_user_status
ON dispatches(user_id, status);

-- Índice para busca por template
CREATE INDEX IF NOT EXISTS idx_dispatches_template_id
ON dispatches(template_id);

-- ============================================
-- TABELA: dispatch_jobs
-- Armazena os jobs individuais de cada disparo (uma mensagem por contato)
-- ============================================
CREATE TABLE IF NOT EXISTS dispatch_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispatch_id UUID NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE, -- FK para dispatches
  contact_data JSONB NOT NULL, -- Dados do contato: número, nome, etc.
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'invalid')),
  message_id VARCHAR(255), -- ID da mensagem enviada (nullable até ser enviada)
  error_message TEXT, -- Mensagem de erro (nullable)
  scheduled_at TIMESTAMP NOT NULL, -- Quando a mensagem deve ser enviada
  sent_at TIMESTAMP, -- Quando a mensagem foi enviada (nullable)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice para busca rápida por dispatch
CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_dispatch_id
ON dispatch_jobs(dispatch_id);

-- Índice para busca por status
CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_status
ON dispatch_jobs(status);

-- Índice para busca por scheduled_at (usado pelo scheduler)
CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_scheduled_at
ON dispatch_jobs(scheduled_at) WHERE status = 'pending';

-- Índice composto para busca por dispatch e status
CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_dispatch_status
ON dispatch_jobs(dispatch_id, status);

-- Índice para busca por message_id
CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_message_id
ON dispatch_jobs(message_id) WHERE message_id IS NOT NULL;

-- ============================================
-- TRIGGERS: Atualizar updated_at automaticamente
-- ============================================

-- Trigger para templates
CREATE OR REPLACE FUNCTION update_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_templates_updated_at
BEFORE UPDATE ON templates
FOR EACH ROW
EXECUTE FUNCTION update_templates_updated_at();

-- Trigger para dispatches
CREATE OR REPLACE FUNCTION update_dispatches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_dispatches_updated_at
BEFORE UPDATE ON dispatches
FOR EACH ROW
EXECUTE FUNCTION update_dispatches_updated_at();

-- Comentários explicativos
COMMENT ON TABLE templates IS 'Armazena templates de mensagens criados pelos usuários';
COMMENT ON TABLE dispatches IS 'Armazena disparos de mensagens em massa';
COMMENT ON TABLE dispatch_jobs IS 'Armazena jobs individuais de cada disparo (uma mensagem por contato)';

COMMENT ON COLUMN templates.content IS 'JSONB com estrutura variável dependendo do tipo: text, image, sequence, etc.';
COMMENT ON COLUMN dispatches.settings IS 'JSONB com configurações: velocidade, exclusão automática, delay, etc.';
COMMENT ON COLUMN dispatches.schedule IS 'JSONB com agendamento: startTime, endTime, suspendedDays, etc.';
COMMENT ON COLUMN dispatches.contacts_data IS 'JSONB array com contatos selecionados para o disparo';
COMMENT ON COLUMN dispatches.stats IS 'JSONB com estatísticas: sent, failed, invalid, total';
COMMENT ON COLUMN dispatch_jobs.contact_data IS 'JSONB com dados do contato: phone, name, normalizedPhone, etc.';

