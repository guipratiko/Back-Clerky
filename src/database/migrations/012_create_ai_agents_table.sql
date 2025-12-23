-- Migration: Criar tabela para armazenar configurações de Agentes de IA
-- Data: 2025-12-23

-- Criar tabela
CREATE TABLE IF NOT EXISTS ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(24) NOT NULL, -- ID do usuário do MongoDB
  instance_id VARCHAR(24) NOT NULL, -- ID da instância WhatsApp
  name VARCHAR(255) NOT NULL, -- Nome do agente
  prompt TEXT NOT NULL, -- Prompt do agente (até 100.000 caracteres)
  wait_time INTEGER NOT NULL DEFAULT 13, -- Tempo de espera em segundos (padrão: 13)
  is_active BOOLEAN NOT NULL DEFAULT true, -- Agente ativo ou não
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Constraints inline
  CONSTRAINT check_prompt_length CHECK (LENGTH(prompt) <= 100000),
  CONSTRAINT check_wait_time_positive CHECK (wait_time > 0)
);

-- Índices para busca rápida
CREATE INDEX IF NOT EXISTS idx_ai_agents_user_id ON ai_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_instance_id ON ai_agents(instance_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_active ON ai_agents(is_active) WHERE is_active = true;

