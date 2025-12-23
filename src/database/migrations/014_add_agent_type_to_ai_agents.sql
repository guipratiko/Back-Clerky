-- Migration: Adicionar campos agent_type e assisted_config à tabela ai_agents
-- Data: 2025-12-23

ALTER TABLE ai_agents
ADD COLUMN IF NOT EXISTS agent_type VARCHAR(20) NOT NULL DEFAULT 'manual';

ALTER TABLE ai_agents
ADD COLUMN IF NOT EXISTS assisted_config JSONB;

-- Valores possíveis para agent_type: 'manual' (Eu mesmo montarei o prompt) ou 'assisted' (Me ajude montar o prompt)
-- assisted_config armazena a configuração do formulário assistido em formato JSON
