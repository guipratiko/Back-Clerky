/**
 * Script para dropar todas as tabelas e recriar do zero
 * 
 * Uso: npm run reset-db
 * ou: ts-node-dev --transpile-only src/scripts/resetDatabase.ts
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

/**
 * Dropar todas as tabelas
 */
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

    // Lista de todas as tabelas para dropar (em ordem reversa de dependências)
    const tables = [
      'workflow_contacts',
      'workflows',
      'ai_agents',
      'openai_memory',
      'google_tokens',
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
      await client.query('DROP FUNCTION IF EXISTS update_openai_memory_updated_at() CASCADE;');
      await client.query('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;');
      await client.query('DROP FUNCTION IF EXISTS update_contact_last_message() CASCADE;');
      await client.query('DROP FUNCTION IF EXISTS increment_unread_count() CASCADE;');
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
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Executa um arquivo SQL
 */
async function runMigration(filePath: string): Promise<void> {
  const client = await pool.connect();
  
  try {
    console.log(`\n📄 Executando migration: ${filePath}`);
    
    const sql = readFileSync(filePath, 'utf8');
    
    console.log('⏳ Executando SQL (isso pode levar alguns segundos)...');
    
    // Executar SQL completo
    await client.query(sql);
    
    console.log(`✅ Migration executada com sucesso: ${filePath}`);
  } catch (error: any) {
    console.error(`❌ Erro ao executar migration ${filePath}:`, error.message);
    if (error.code) {
      console.error(`   Código do erro PostgreSQL: ${error.code}`);
    }
    if (error.position) {
      console.error(`   Posição do erro: ${error.position}`);
    }
    // Se for erro de "já existe", não é crítico
    if (error.message.includes('already exists') || error.code === '42P07' || error.code === '42710') {
      console.log('⚠️  Alguns objetos já existem, mas continuando...');
      return;
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Executa todas as migrations em ordem
 */
async function runAllMigrations(): Promise<void> {
  try {
    console.log('\n🚀 Iniciando execução de migrations...\n');
    
    // Lista de migrations em ordem
    const migrations = [
      '001_create_crm_tables.sql',
      '002_add_short_id_to_columns.sql',
      '003_fix_message_id_unique_per_instance.sql',
      '004_create_labels_system.sql',
      '005_add_short_id_to_labels.sql',
      '006_create_dispatches_tables.sql',
      '007_cleanup_dispatches_table.sql',
      '008_fix_templates_type_constraint.sql',
      '009_create_workflows_tables.sql',
      '010_create_google_tokens_table.sql',
      '011_create_openai_memory_table.sql',
      '012_create_ai_agents_table.sql',
    ];
    
    for (const migration of migrations) {
      const migrationPath = join(__dirname, '../database/migrations', migration);
      await runMigration(migrationPath);
    }
    
    console.log('\n✅ Todas as migrations foram executadas com sucesso!');
  } catch (error: any) {
    console.error('\n❌ Erro ao executar migrations:', error.message);
    if (error.code) {
      console.error(`   Código do erro PostgreSQL: ${error.code}`);
    }
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    throw error;
  }
}

/**
 * Função principal: dropar tudo e recriar
 */
async function resetDatabase(): Promise<void> {
  try {
    // Passo 1: Dropar todas as tabelas
    await dropAllTables();
    
    // Passo 2: Recriar todas as tabelas
    await runAllMigrations();
    
    console.log('\n🎉 Banco de dados resetado e recriado com sucesso!');
  } catch (error: any) {
    console.error('\n❌ Erro ao resetar banco de dados:', error.message);
    if (error.code) {
      console.error(`   Código do erro PostgreSQL: ${error.code}`);
    }
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n🔌 Conexão fechada');
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  resetDatabase();
}

export { resetDatabase };

