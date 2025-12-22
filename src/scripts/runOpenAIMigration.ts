/**
 * Script para executar apenas a migration da tabela openai_memory
 * 
 * Uso: npm run migrate:openai
 * ou: ts-node-dev --transpile-only src/scripts/runOpenAIMigration.ts
 */

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const POSTGRES_URI = process.env.POSTGRES_URI || 
  'postgres://clerkypost:rf3dF5Bj76Tt4Olp@easy.clerky.com.br:5433/clerkysys?sslmode=disable';

const pool = new Pool({
  connectionString: POSTGRES_URI,
  max: 1,
  connectionTimeoutMillis: 10000,
  query_timeout: 30000,
});

async function runOpenAIMigration(): Promise<void> {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Executando migration da tabela openai_memory...\n');
    console.log(`📡 Conectando ao PostgreSQL: ${POSTGRES_URI.split('@')[1]}`);
    
    // Testar conexão
    await client.query('SELECT NOW()');
    console.log('✅ Conexão estabelecida\n');
    
    const migrationPath = join(__dirname, '../database/migrations/011_create_openai_memory_table.sql');
    console.log(`📄 Lendo migration: ${migrationPath}`);
    
    const sql = readFileSync(migrationPath, 'utf8');
    
    console.log('⏳ Executando SQL...');
    await client.query(sql);
    
    console.log('✅ Migration executada com sucesso!');
    console.log('✅ Tabela openai_memory criada');
  } catch (error: any) {
    console.error('❌ Erro ao executar migration:', error.message);
    if (error.code) {
      console.error(`   Código do erro PostgreSQL: ${error.code}`);
    }
    // Se a tabela já existe, não é erro crítico
    if (error.code === '42P07' || error.message.includes('already exists')) {
      console.log('⚠️  Tabela já existe, mas continuando...');
      return;
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
    console.log('\n🔌 Conexão fechada');
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  runOpenAIMigration().catch((error) => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });
}

export { runOpenAIMigration };

