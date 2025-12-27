-- Script para deletar tabelas de disparos do banco de dados
-- Execute este script no PostgreSQL para remover todas as tabelas relacionadas a disparos

-- Deletar tabelas (em ordem devido às foreign keys)
DROP TABLE IF EXISTS dispatch_jobs CASCADE;
DROP TABLE IF EXISTS dispatches CASCADE;
DROP TABLE IF EXISTS templates CASCADE;

-- Verificar se as tabelas foram deletadas
SELECT 
    table_name 
FROM 
    information_schema.tables 
WHERE 
    table_schema = 'public' 
    AND table_name IN ('templates', 'dispatches', 'dispatch_jobs');

-- Se não retornar nenhuma linha, as tabelas foram deletadas com sucesso

