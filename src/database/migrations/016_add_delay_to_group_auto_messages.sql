-- Migration: Adicionar campo delay para mensagens automáticas de grupos
-- Este campo permite configurar um atraso antes de enviar a mensagem automática

ALTER TABLE group_auto_messages
ADD COLUMN IF NOT EXISTS delay_seconds INTEGER DEFAULT 0 CHECK (delay_seconds >= 0);

COMMENT ON COLUMN group_auto_messages.delay_seconds IS 'Atraso em segundos antes de enviar a mensagem automática (padrão: 0)';
