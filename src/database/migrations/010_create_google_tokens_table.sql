-- Migration: Criar tabela para tokens OAuth do Google
-- Data: 2025-12-22

-- Tabela de tokens OAuth do Google
CREATE TABLE IF NOT EXISTS google_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expiry_date BIGINT NOT NULL,
  scope TEXT,
  token_type VARCHAR(50) DEFAULT 'Bearer',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_google_tokens_user_id UNIQUE (user_id)
);

-- Índice para busca rápida por usuário
CREATE INDEX IF NOT EXISTS idx_google_tokens_user_id ON google_tokens(user_id);

