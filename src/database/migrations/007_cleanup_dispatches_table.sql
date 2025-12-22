-- Migration: Limpar colunas antigas da tabela dispatches
-- Remove colunas que foram substituídas por JSONB (settings e schedule)

-- Verificar se as colunas existem antes de remover
DO $$ 
BEGIN
  -- Remover coluna speed (agora em settings.speed)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dispatches' 
    AND column_name = 'speed'
  ) THEN
    ALTER TABLE dispatches DROP COLUMN speed;
    RAISE NOTICE 'Coluna speed removida';
  END IF;

  -- Remover coluna auto_delete (agora em settings.autoDelete)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dispatches' 
    AND column_name = 'auto_delete'
  ) THEN
    ALTER TABLE dispatches DROP COLUMN auto_delete;
    RAISE NOTICE 'Coluna auto_delete removida';
  END IF;

  -- Remover coluna auto_delete_delay (agora em settings.deleteDelay)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dispatches' 
    AND column_name = 'auto_delete_delay'
  ) THEN
    ALTER TABLE dispatches DROP COLUMN auto_delete_delay;
    RAISE NOTICE 'Coluna auto_delete_delay removida';
  END IF;

  -- Remover coluna start_time (agora em schedule.startTime)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dispatches' 
    AND column_name = 'start_time'
  ) THEN
    ALTER TABLE dispatches DROP COLUMN start_time;
    RAISE NOTICE 'Coluna start_time removida';
  END IF;

  -- Remover coluna end_time (agora em schedule.endTime)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dispatches' 
    AND column_name = 'end_time'
  ) THEN
    ALTER TABLE dispatches DROP COLUMN end_time;
    RAISE NOTICE 'Coluna end_time removida';
  END IF;

  -- Remover coluna disabled_days (agora em schedule.suspendedDays)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dispatches' 
    AND column_name = 'disabled_days'
  ) THEN
    ALTER TABLE dispatches DROP COLUMN disabled_days;
    RAISE NOTICE 'Coluna disabled_days removida';
  END IF;

  -- Remover coluna scheduled_at (não é mais necessária)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dispatches' 
    AND column_name = 'scheduled_at'
  ) THEN
    ALTER TABLE dispatches DROP COLUMN scheduled_at;
    RAISE NOTICE 'Coluna scheduled_at removida';
  END IF;

  -- Remover coluna last_processed_at (não é mais necessária)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dispatches' 
    AND column_name = 'last_processed_at'
  ) THEN
    ALTER TABLE dispatches DROP COLUMN last_processed_at;
    RAISE NOTICE 'Coluna last_processed_at removida';
  END IF;

  -- Remover colunas de estatísticas antigas (agora em stats JSONB)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dispatches' 
    AND column_name = 'total_recipients'
  ) THEN
    ALTER TABLE dispatches DROP COLUMN total_recipients;
    RAISE NOTICE 'Coluna total_recipients removida';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dispatches' 
    AND column_name = 'sent_count'
  ) THEN
    ALTER TABLE dispatches DROP COLUMN sent_count;
    RAISE NOTICE 'Coluna sent_count removida';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dispatches' 
    AND column_name = 'failed_count'
  ) THEN
    ALTER TABLE dispatches DROP COLUMN failed_count;
    RAISE NOTICE 'Coluna failed_count removida';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dispatches' 
    AND column_name = 'invalid_count'
  ) THEN
    ALTER TABLE dispatches DROP COLUMN invalid_count;
    RAISE NOTICE 'Coluna invalid_count removida';
  END IF;

END $$;

-- Adicionar coluna contacts_data se não existir (pode ter sido criada com nome diferente)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dispatches' 
    AND column_name = 'contacts_data'
  ) THEN
    ALTER TABLE dispatches ADD COLUMN contacts_data JSONB NOT NULL DEFAULT '[]'::jsonb;
    RAISE NOTICE 'Coluna contacts_data adicionada';
  END IF;
END $$;

-- Adicionar coluna settings se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dispatches' 
    AND column_name = 'settings'
  ) THEN
    ALTER TABLE dispatches ADD COLUMN settings JSONB NOT NULL DEFAULT '{}'::jsonb;
    RAISE NOTICE 'Coluna settings adicionada';
  END IF;
END $$;

-- Adicionar coluna stats se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dispatches' 
    AND column_name = 'stats'
  ) THEN
    ALTER TABLE dispatches ADD COLUMN stats JSONB NOT NULL DEFAULT '{"sent": 0, "failed": 0, "invalid": 0, "total": 0}'::jsonb;
    RAISE NOTICE 'Coluna stats adicionada';
  END IF;
END $$;

-- Comentários
COMMENT ON COLUMN dispatches.settings IS 'JSONB com configurações: velocidade, exclusão automática, delay, etc.';
COMMENT ON COLUMN dispatches.schedule IS 'JSONB com agendamento: startTime, endTime, suspendedDays, etc.';
COMMENT ON COLUMN dispatches.contacts_data IS 'JSONB array com contatos selecionados para o disparo';
COMMENT ON COLUMN dispatches.stats IS 'JSONB com estatísticas: sent, failed, invalid, total';

