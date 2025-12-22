-- Migration: Criar tabelas para workflows (MindClerky)
-- Data: 2025-02-XX

-- Habilitar extensão UUID (se ainda não estiver habilitada)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabela de workflows
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB (mesmo padrão do CRM)
  name VARCHAR(255) NOT NULL,
  instance_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices para workflows
CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_workflows_instance_id ON workflows(instance_id);
CREATE INDEX IF NOT EXISTS idx_workflows_is_active ON workflows(is_active);

-- Tabela de contatos que entraram em workflows
CREATE TABLE IF NOT EXISTS workflow_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL,
  contact_phone VARCHAR(50) NOT NULL,
  instance_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  entered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_workflow_contacts_workflow FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  CONSTRAINT uq_workflow_contacts UNIQUE (workflow_id, contact_phone, instance_id)
);

-- Índices para workflow_contacts
CREATE INDEX IF NOT EXISTS idx_workflow_contacts_workflow_id ON workflow_contacts(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_contacts_phone ON workflow_contacts(contact_phone);
CREATE INDEX IF NOT EXISTS idx_workflow_contacts_instance_id ON workflow_contacts(instance_id);
