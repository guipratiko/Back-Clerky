/**
 * Script para executar apenas a migration de grupos (015)
 * 
 * Uso: ts-node-dev --transpile-only src/scripts/runGroupMigration.ts
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

async function runGroupMigration(): Promise<void> {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Executando migration de grupos (015)...\n');
    console.log(`📡 Conectando ao PostgreSQL: ${POSTGRES_URI.split('@')[1]}`);
    
    // Testar conexão primeiro
    await client.query('SELECT NOW()');
    console.log('✅ Conexão com PostgreSQL estabelecida\n');
    
    const migrationPath = join(__dirname, '../database/migrations/015_create_group_movements_and_auto_messages.sql');
    console.log(`📄 Executando migration: ${migrationPath}\n`);
    
    const sql = readFileSync(migrationPath, 'utf8');
    
    console.log('⏳ Executando SQL (isso pode levar alguns segundos)...\n');
    
    await client.query(sql);
    
    console.log('✅ Migration executada com sucesso!\n');
    console.log('📊 Tabelas criadas:');
    console.log('   - group_movements (histórico de movimentações)');
    console.log('   - group_auto_messages (configurações de mensagens automáticas)');
  } catch (error: any) {
    console.error(`❌ Erro ao executar migration:`, error.message);
    if (error.code) {
      console.error(`   Código do erro PostgreSQL: ${error.code}`);
    }
    if (error.position) {
      console.error(`   Posição do erro: ${error.position}`);
    }
    // Se for erro de "já existe", não é crítico
    if (error.message.includes('already exists') || error.code === '42P07' || error.code === '42710') {
      console.log('⚠️  Alguns objetos já existem, mas isso é normal se a migration já foi executada.');
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
  runGroupMigration()
    .then(() => {
      console.log('\n✅ Processo concluído!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erro fatal:', error);
      process.exit(1);
    });
}

export { runGroupMigration };
