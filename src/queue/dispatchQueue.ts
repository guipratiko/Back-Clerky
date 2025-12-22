/**
 * Configuração da Queue de Disparos usando Bull
 * Utiliza Redis para gerenciar jobs
 */

import Queue from 'bull';
import { REDIS_CONFIG } from '../config/constants';

// Configurar conexão Redis para Bull
// Parse da URI do Redis (formato: redis://password@host:port ou redis://host:port)
const parseRedisUri = (uri: string) => {
  try {
    const url = new URL(uri);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 6379,
      password: url.password || undefined,
    };
  } catch {
    // Fallback para parsing manual
    const match = uri.match(/redis:\/\/(?:([^:@]+):([^@]+)@)?([^:]+):(\d+)/);
    if (match) {
      return {
        host: match[3],
        port: parseInt(match[4]) || 6379,
        password: match[2] || undefined,
      };
    }
    // Default
    return {
      host: 'localhost',
      port: 6379,
      password: undefined,
    };
  }
};

const redisConfig = parseRedisUri(REDIS_CONFIG.URI);

// Criar queue de disparos
export const dispatchQueue = new Queue('dispatch', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Manter jobs completos por 24 horas
      count: 1000, // Manter últimos 1000 jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Manter jobs falhos por 7 dias
    },
  },
});

// Event listeners para monitoramento
dispatchQueue.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completado: ${job.data.contactData?.phone || 'N/A'}`);
});

dispatchQueue.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} falhou:`, err.message);
});

dispatchQueue.on('error', (error) => {
  console.error('❌ Erro na queue de disparos:', error);
});

// Registrar processador de jobs
import { processDispatchJob } from './dispatchProcessor';

dispatchQueue.process('dispatch', async (job) => {
  return await processDispatchJob(job);
});

// Limpar queue ao encerrar processo
process.on('SIGTERM', async () => {
  await dispatchQueue.close();
});

process.on('SIGINT', async () => {
  await dispatchQueue.close();
});

export default dispatchQueue;

