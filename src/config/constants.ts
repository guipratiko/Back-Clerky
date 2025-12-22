/**
 * Configurações centralizadas do sistema
 * Todas as constantes e variáveis de ambiente devem ser acessadas através deste arquivo
 */

import dotenv from 'dotenv';

// Carregar variáveis de ambiente antes de acessá-las
dotenv.config();

// JWT Configuration
export const JWT_CONFIG = {
  SECRET: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  EXPIRE: process.env.JWT_EXPIRE || '7d',
};

// Server Configuration
export const SERVER_CONFIG = {
  PORT: process.env.PORT || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
};

// Evolution API Configuration
export const EVOLUTION_CONFIG = {
  HOST: process.env.EVOLUTION_HOST || 'evo.clerky.com.br',
  API_KEY: process.env.EVOLUTION_APIKEY || '',
  SETTINGS_PATH: process.env.EVOLUTION_SETTINGS_PATH || '/instance/settings/{instance}',
};

// Webhook Configuration
export const WEBHOOK_CONFIG = {
  BASE_URL: process.env.WEBHOOK_BASE_URL || 'http://api.clerky.com.br/webhook/api',
  BASE64: process.env.WEBHOOK_BASE64 === 'true',
  EVENTS: (process.env.WEBHOOK_EVENTS || 'MESSAGES_UPSERT,MESSAGES_DELETE')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

// Database Configuration
export const DATABASE_CONFIG = {
  URI: process.env.MONGODB_URI || 'mongodb://clerky:qGfdSCz1bDTuHD5o@easy.clerky.com.br:27017/?tls=false',
};

// PostgreSQL Configuration (CRM e Conversas)
export const POSTGRES_CONFIG = {
  URI: process.env.POSTGRES_URI || 'postgres://clerkypost:rf3dF5Bj76Tt4Olp@easy.clerky.com.br:5433/clerkysys?sslmode=disable',
};

// Redis Configuration (Cache e Sessões)
export const REDIS_CONFIG = {
  URI: process.env.REDIS_URI || 'redis://default:Gd4562Vbfs341le@easy.clerky.com.br:6378',
};

// Media Service Configuration
export const MEDIA_SERVICE_CONFIG = {
  URL: process.env.MEDIA_SERVICE_URL || 'https://midiaservice-midiaservice.o31xjg.easypanel.host',
  TOKEN: process.env.MEDIA_SERVICE_TOKEN || 'Fg34Dsew5783gTy',
};

