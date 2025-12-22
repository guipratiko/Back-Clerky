-- Migration: Adicionar campo short_id na tabela labels
-- O short_id será um número único por usuário (1, 2, 3, 4, 5) baseado no order_index

-- Adicionar coluna short_id (INTEGER, pode ser NULL temporariamente)
ALTER TABLE labels 
ADD COLUMN IF NOT EXISTS short_id INTEGER;

-- Popular short_id para labels existentes (order_index + 1)
UPDATE labels 
SET short_id = order_index + 1
WHERE short_id IS NULL;

-- Tornar short_id NOT NULL
ALTER TABLE labels 
ALTER COLUMN short_id SET NOT NULL;

-- Adicionar constraint UNIQUE por usuário
-- Um usuário não pode ter dois short_ids iguais
CREATE UNIQUE INDEX IF NOT EXISTS idx_labels_user_short_id 
ON labels(user_id, short_id);

-- Comentário na coluna
COMMENT ON COLUMN labels.short_id IS 'ID curto único por usuário (1-5), baseado na ordem da label';

