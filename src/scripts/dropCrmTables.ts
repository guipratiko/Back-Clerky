/**
 * Script para dropar todas as tabelas do CRM no PostgreSQL
 * 
 * Uso: npm run drop-tables
 * ou: ts-node-dev --transpile-only src/scripts/dropCrmTables.ts
 * 
 * ⚠️ ATENÇÃO: Este script deleta TODAS as tabelas do CRM!
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
});

/**
 * Dropar todas as tabelas do CRM
 */
async function dropCrmTables(): Promise<void> {
  const client = await pool.connect();
  
  try {
    console.log('🗑️  Iniciando remoção de tabelas do CRM...\n');
    console.log(`📡 Conectando ao PostgreSQL: ${POSTGRES_URI.split('@')[1]}`);
    
    // Testar conexão primeiro
    await client.query('SELECT NOW()');
    console.log('✅ Conexão com PostgreSQL estabelecida\n');
    
    // Ordem de drop (respeitando foreign keys)
    const tables = [
      'messages',      // Primeiro (tem FK para contacts)
      'contacts',      // Segundo (tem FK para crm_columns)
      'crm_columns',   // Terceiro (não tem FK)
    ];
    
    console.log('⚠️  ATENÇÃO: Todas as tabelas do CRM serão deletadas!');
    console.log('📋 Tabelas a serem removidas:');
    tables.forEach((table, index) => {
      console.log(`   ${index + 1}. ${table}`);
    });
    console.log('');
    
    // Dropar tabelas
    for (const table of tables) {
      try {
        console.log(`🗑️  Removendo tabela: ${table}...`);
        await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
        console.log(`✅ Tabela ${table} removida com sucesso`);
      } catch (error: any) {
        // Se não existir, não é erro
        if (error.code === '42P01') {
          console.log(`⚠️  Tabela ${table} não existe, ignorando...`);
        } else {
          throw error;
        }
      }
    }
    
    // Dropar funções e triggers se existirem
    console.log('\n🗑️  Removendo funções e triggers...');
    const functions = [
      'update_updated_at_column',
      'update_contact_last_message',
      'increment_unread_count',
    ];
    
    for (const func of functions) {
      try {
        await client.query(`DROP FUNCTION IF EXISTS ${func}() CASCADE`);
        console.log(`✅ Função ${func} removida`);
      } catch (error: any) {
        // Ignorar se não existir
        if (error.code !== '42883') {
          console.log(`⚠️  Erro ao remover função ${func}: ${error.message}`);
        }
      }
    }
    
    // Dropar extensão UUID se não estiver sendo usada
    try {
      console.log('\n🗑️  Verificando extensão uuid-ossp...');
      await client.query('DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE');
      console.log('✅ Extensão uuid-ossp removida (se existia)');
    } catch (error: any) {
      console.log('⚠️  Não foi possível remover extensão (pode estar em uso)');
    }
    
    console.log('\n✅ Todas as tabelas do CRM foram removidas com sucesso!');
    console.log('💡 Agora você pode executar: npm run migrate');
    
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
  dropCrmTables();
}

export { dropCrmTables };

