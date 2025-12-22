/**
 * Script para dropar todas as tabelas do PostgreSQL
 * 
 * Uso: ts-node-dev --transpile-only src/scripts/dropAllTables.ts
 */

import { Pool } from 'pg';
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

async function dropAllTables(): Promise<void> {
  const client = await pool.connect();
  
  try {
    console.log('🗑️  Iniciando drop de todas as tabelas...\n');
    console.log(`📡 Conectando ao PostgreSQL: ${POSTGRES_URI.split('@')[1]}`);
    
    // Testar conexão
    await client.query('SELECT NOW()');
    console.log('✅ Conexão estabelecida\n');

    // Desabilitar foreign key checks temporariamente
    await client.query('SET session_replication_role = replica;');

    // Lista de todas as tabelas para dropar
    const tables = [
      'workflow_contacts',
      'workflows',
      'dispatch_jobs',
      'dispatches',
      'templates',
      'contact_labels',
      'labels',
      'messages',
      'contacts',
      'crm_columns',
    ];

    console.log('📋 Tabelas a serem removidas:');
    tables.forEach(table => console.log(`   - ${table}`));
    console.log('');

    // Dropar tabelas em ordem (respeitando foreign keys)
    for (const table of tables) {
      try {
        console.log(`🗑️  Removendo tabela: ${table}...`);
        await client.query(`DROP TABLE IF EXISTS ${table} CASCADE;`);
        console.log(`✅ Tabela ${table} removida\n`);
      } catch (error: any) {
        if (error.message.includes('does not exist')) {
          console.log(`⚠️  Tabela ${table} não existe, pulando...\n`);
        } else {
          console.error(`❌ Erro ao remover ${table}:`, error.message);
        }
      }
    }

    // Dropar funções e triggers relacionados
    console.log('🗑️  Removendo funções e triggers...');
    try {
      await client.query('DROP FUNCTION IF EXISTS update_workflows_updated_at() CASCADE;');
      await client.query('DROP FUNCTION IF EXISTS update_templates_updated_at() CASCADE;');
      await client.query('DROP FUNCTION IF EXISTS update_dispatches_updated_at() CASCADE;');
      console.log('✅ Funções removidas\n');
    } catch (error: any) {
      console.log('⚠️  Algumas funções não existiam\n');
    }

    // Reabilitar foreign key checks
    await client.query('SET session_replication_role = DEFAULT;');

    console.log('✅ Todas as tabelas foram removidas com sucesso!');
  } catch (error: any) {
    console.error('\n❌ Erro ao dropar tabelas:', error.message);
    if (error.code) {
      console.error(`   Código do erro PostgreSQL: ${error.code}`);
    }
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    console.log('\n🔌 Conexão fechada');
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  dropAllTables();
}

export { dropAllTables };

