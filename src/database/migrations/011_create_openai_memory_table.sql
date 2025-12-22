-- Migration: Criar tabela para armazenar memória/conversação da OpenAI
-- Data: 2025-12-22

CREATE TABLE IF NOT EXISTS openai_memory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL,
  contact_phone VARCHAR(50) NOT NULL,
  instance_id VARCHAR(24) NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array de mensagens: [{ role: 'user'|'assistant', content: string, timestamp: string }]
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_openai_memory_workflow FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  CONSTRAINT uq_openai_memory UNIQUE (workflow_id, contact_phone, instance_id)
);

-- Índices para openai_memory
CREATE INDEX IF NOT EXISTS idx_openai_memory_workflow_id ON openai_memory(workflow_id);
CREATE INDEX IF NOT EXISTS idx_openai_memory_contact_phone ON openai_memory(contact_phone);
CREATE INDEX IF NOT EXISTS idx_openai_memory_instance_id ON openai_memory(instance_id);
CREATE INDEX IF NOT EXISTS idx_openai_memory_workflow_contact ON openai_memory(workflow_id, contact_phone, instance_id);

-- Trigger para atualizar updated_at (se a função existir)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER update_openai_memory_updated_at
      BEFORE UPDATE ON openai_memory
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

