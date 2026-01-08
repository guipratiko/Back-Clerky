-- Migration: Corrigir constraint deferrable em group_auto_messages
-- O PostgreSQL não permite usar constraints deferrable em ON CONFLICT

-- Remover a constraint deferrable existente
ALTER TABLE group_auto_messages 
DROP CONSTRAINT IF EXISTS unique_user_global_config;

-- Recriar a constraint sem DEFERRABLE
ALTER TABLE group_auto_messages
ADD CONSTRAINT unique_user_global_config UNIQUE (user_id, group_id);
