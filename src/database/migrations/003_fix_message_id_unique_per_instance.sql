-- Migration: Corrigir constraint UNIQUE de message_id para ser único por instância
-- Problema: message_id era único globalmente, causando conflito quando duas instâncias
-- trocam mensagens entre elas ou recebem a mesma mensagem (ex: grupos)

-- Remover constraint UNIQUE global de message_id (se existir)
-- Primeiro, dropar a constraint (isso também remove o índice associado)
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_id_key CASCADE;

-- Dropar índices adicionais (caso ainda existam)
DROP INDEX IF EXISTS idx_messages_message_id;

-- Criar constraint UNIQUE composta: message_id + instance_id
-- Isso permite que o mesmo messageId exista em instâncias diferentes
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_message_id_instance_id
ON messages(message_id, instance_id);

-- Comentário explicativo
COMMENT ON INDEX idx_messages_message_id_instance_id IS 
'Garante que message_id seja único por instância, permitindo que diferentes instâncias recebam a mesma mensagem (ex: grupos) ou troquem mensagens entre elas sem conflito';

