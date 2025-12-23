-- Migration: Adicionar campo transcribe_audio à tabela ai_agents
-- Data: 2025-12-23

ALTER TABLE ai_agents
ADD COLUMN IF NOT EXISTS transcribe_audio BOOLEAN NOT NULL DEFAULT true;

