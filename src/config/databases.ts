/**
 * Configuração e gerenciamento de todas as conexões de banco de dados
 * - MongoDB: User e Instance
 * - PostgreSQL: CRM (Contact, Message, CRMColumn)
 * - Redis: Cache e Sessões
 */

import mongoose from 'mongoose';
import { Pool, PoolClient } from 'pg';
import Redis from 'ioredis';
import { DATABASE_CONFIG, POSTGRES_CONFIG, REDIS_CONFIG } from './constants';

// ============================================
// MongoDB (User e Instance)
// ============================================
export const connectMongoDB = async (): Promise<void> => {
  try {
    await mongoose.connect(DATABASE_CONFIG.URI);
    console.log('✅ Conectado ao MongoDB com sucesso');
  } catch (error) {
    console.error('❌ Erro ao conectar ao MongoDB:', error);
    process.exit(1);
  }
};

// Event listeners para MongoDB
mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB desconectado');
});

mongoose.connection.on('error', (error) => {
  console.error('❌ Erro na conexão MongoDB:', error);
});

// ============================================
// PostgreSQL (CRM e Conversas)
// ============================================
export const pgPool = new Pool({
  connectionString: POSTGRES_CONFIG.URI,
  max: 20, // Máximo de conexões no pool
  idleTimeoutMillis: 30000, // Fechar conexões idle após 30s
  connectionTimeoutMillis: 2000, // Timeout de conexão de 2s
});

// Event listeners para PostgreSQL
pgPool.on('connect', () => {
  console.log('✅ Nova conexão PostgreSQL estabelecida');
});

pgPool.on('error', (err) => {
  console.error('❌ Erro inesperado no pool PostgreSQL:', err);
});

// Função para testar conexão PostgreSQL
export const testPostgreSQL = async (): Promise<boolean> => {
  try {
    const client = await pgPool.connect();
    await client.query('SELECT NOW()');
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Erro ao testar conexão PostgreSQL:', error);
    return false;
  }
};

// Função para obter cliente PostgreSQL (para transações)
export const getPostgreSQLClient = async (): Promise<PoolClient> => {
  return await pgPool.connect();
};

// ============================================
// Redis (Cache e Sessões)
// ============================================
export const redisClient = new Redis(REDIS_CONFIG.URI, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  },
});

// Event listeners para Redis
redisClient.on('connect', () => {
  console.log('✅ Conectado ao Redis');
});

redisClient.on('ready', () => {
  console.log('✅ Redis pronto para uso');
});

redisClient.on('error', (err) => {
  console.error('❌ Erro no Redis:', err);
});

redisClient.on('close', () => {
  console.log('⚠️  Conexão Redis fechada');
});

redisClient.on('reconnecting', () => {
  console.log('🔄 Reconectando ao Redis...');
});

// Função para testar conexão Redis
export const testRedis = async (): Promise<boolean> => {
  try {
    await redisClient.ping();
    return true;
  } catch (error) {
    console.error('❌ Erro ao testar conexão Redis:', error);
    return false;
  }
};

// ============================================
// Função para conectar todos os bancos
// ============================================
export const connectAllDatabases = async (): Promise<void> => {
  try {
    // Conectar MongoDB
    await connectMongoDB();

    // Testar PostgreSQL
    const pgConnected = await testPostgreSQL();
    if (pgConnected) {
      console.log('✅ PostgreSQL conectado e testado');
    } else {
      console.warn('⚠️  PostgreSQL não conectado, mas continuando...');
    }

    // Testar Redis
    const redisConnected = await testRedis();
    if (redisConnected) {
      console.log('✅ Redis conectado e testado');
    } else {
      console.warn('⚠️  Redis não conectado, mas continuando...');
    }
  } catch (error) {
    console.error('❌ Erro ao conectar bancos de dados:', error);
    throw error;
  }
};

// ============================================
// Função para fechar todas as conexões
// ============================================
export const closeAllDatabases = async (): Promise<void> => {
  try {
    // Fechar MongoDB
    await mongoose.connection.close();
    console.log('✅ MongoDB desconectado');

    // Fechar PostgreSQL
    await pgPool.end();
    console.log('✅ PostgreSQL desconectado');

    // Fechar Redis
    redisClient.disconnect();
    console.log('✅ Redis desconectado');
  } catch (error) {
    console.error('❌ Erro ao fechar conexões:', error);
  }
};

// Exportar instâncias para uso direto
export { mongoose, pgPool, redisClient };

