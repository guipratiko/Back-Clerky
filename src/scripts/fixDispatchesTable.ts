/**
 * Script para verificar e corrigir a tabela dispatches
 * Adiciona a coluna schedule se não existir
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const POSTGRES_URI = process.env.POSTGRES_URI || 
  'postgres://clerkypost:rf3dF5Bj76Tt4Olp@easy.clerky.com.br:5433/clerkysys?sslmode=disable';

const pool = new Pool({
  connectionString: POSTGRES_URI,
  max: 1,
});

async function fixDispatchesTable() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Verificando estrutura da tabela dispatches...\n');
    
    // Verificar se a tabela existe
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'dispatches'
      );
    `);
    
    if (!tableExists.rows[0].exists) {
      console.log('❌ Tabela dispatches não existe! Execute a migration primeiro.');
      return;
    }
    
    console.log('✅ Tabela dispatches existe');
    
    // Verificar se a coluna schedule existe
    const columnExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'dispatches' 
        AND column_name = 'schedule'
      );
    `);
    
    if (columnExists.rows[0].exists) {
      console.log('✅ Coluna schedule já existe');
    } else {
      console.log('⚠️  Coluna schedule não existe. Adicionando...');
      
      await client.query(`
        ALTER TABLE dispatches 
        ADD COLUMN schedule JSONB;
      `);
      
      console.log('✅ Coluna schedule adicionada com sucesso!');
    }
    
    // Verificar outras colunas importantes
    const columns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'dispatches'
      ORDER BY ordinal_position;
    `);
    
    console.log('\n📋 Colunas da tabela dispatches:');
    columns.rows.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type})`);
    });
    
  } catch (error: any) {
    console.error('❌ Erro:', error.message);
    if (error.code) {
      console.error(`   Código: ${error.code}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

fixDispatchesTable();

