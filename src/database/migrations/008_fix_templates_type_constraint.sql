-- Migration: Corrigir constraint de tipo de templates
-- Garante que a constraint está correta e permite os valores esperados

-- Remover constraint antiga se existir (pode ter nome diferente)
DO $$
DECLARE
  constraint_name_var TEXT;
BEGIN
  -- Buscar e remover todas as constraints CHECK relacionadas ao tipo
  FOR constraint_name_var IN
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_name = 'templates'
      AND constraint_type = 'CHECK'
      AND constraint_name LIKE '%type%'
  LOOP
    EXECUTE format('ALTER TABLE templates DROP CONSTRAINT IF EXISTS %I', constraint_name_var);
    RAISE NOTICE 'Constraint removida: %', constraint_name_var;
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN
    -- Ignorar erros se constraint não existir
    RAISE NOTICE 'Erro ao remover constraints (pode ser normal): %', SQLERRM;
END $$;

-- Recriar constraint com nome explícito (só se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'templates'
      AND constraint_name = 'templates_type_check'
  ) THEN
    ALTER TABLE templates
    ADD CONSTRAINT templates_type_check
    CHECK (type IN ('text', 'image', 'image_caption', 'video', 'video_caption', 'audio', 'file', 'sequence'));
    RAISE NOTICE 'Constraint templates_type_check criada com sucesso';
  ELSE
    RAISE NOTICE 'Constraint templates_type_check já existe, pulando criação';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Erro ao criar constraint (pode já existir): %', SQLERRM;
END $$;

