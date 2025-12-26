// Configurar timezone para São Paulo, Brasil (America/Sao_Paulo)
process.env.TZ = 'America/Sao_Paulo';

// Importar constants primeiro para carregar dotenv
import { SERVER_CONFIG } from './config/constants';

// Log do timezone configurado
console.log('🕐 Timezone configurado:', Intl.DateTimeFormat().resolvedOptions().timeZone);
console.log('🕐 Data/Hora atual (SP):', new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }));

import express, { Express } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { connectAllDatabases } from './config/databases';
import routes from './routes';
import webhookRoutes from './routes/webhook.routes';
import webhookAPIRoutes from './routes/webhookAPIRoutes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { initializeSocket, startStatusChecker } from './socket/socketServer';

const app: Express = express();
const httpServer = createServer(app);
const PORT = SERVER_CONFIG.PORT;

// Middlewares
app.use(cors({
  origin: SERVER_CONFIG.CORS_ORIGIN,
  credentials: true,
}));
// Aumentar limite de payload para suportar imagens em base64 comprimidas (10MB)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware de debug para webhooks (apenas em desenvolvimento)
if (SERVER_CONFIG.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    if (req.path.startsWith('/webhook')) {
      console.log(`🔍 [DEBUG] Requisição recebida: ${req.method} ${req.path}`);
      console.log(`🔍 [DEBUG] Parâmetros:`, req.params);
      console.log(`🔍 [DEBUG] Query:`, req.query);
    }
    next();
  });
}

// Conectar a todos os bancos de dados (MongoDB, PostgreSQL, Redis)
connectAllDatabases();

// Rotas de Webhook (devem vir antes de /api pois são chamadas diretamente pela Evolution API)
// IMPORTANTE: Esta rota deve vir ANTES de qualquer outra rota que possa capturar /webhook
app.use('/webhook', webhookRoutes);
console.log('✅ Rotas de webhook registradas: /webhook/api/:instanceName');

// Rotas da API Externa (Webhook API) - Requer autenticação por token de instância
app.use('/api/v1/webhook', webhookAPIRoutes);
console.log('✅ Rotas de API externa registradas: /api/v1/webhook/*');

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Clerky API está funcionando',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      instances: '/api/instances',
      crm: '/api/crm',
      dispatches: '/api/dispatches',
      workflows: '/api/workflows',
      webhook: '/webhook/api/:instanceName',
    },
  });
});

// Rotas da API
app.use('/api', routes);

// Middleware de erro 404
app.use(notFoundHandler);

// Middleware de tratamento de erros
app.use(errorHandler);

// Inicializar Socket.io
initializeSocket(httpServer);

// Iniciar verificador de status periódico
startStatusChecker();

// Inicializar scheduler de disparos (aguardar para retomar disparos em execução)
import { startScheduler } from './queue/scheduler';
startScheduler().then(() => {
  console.log('✅ Scheduler de disparos iniciado');
}).catch((error) => {
  console.error('❌ Erro ao iniciar scheduler de disparos:', error);
});

// Iniciar servidor
httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📡 Ambiente: ${SERVER_CONFIG.NODE_ENV}`);
  console.log(`🌐 API disponível em http://localhost:${PORT}/api`);
  console.log(`🔌 WebSocket disponível em ws://localhost:${PORT}`);
  console.log(`📥 Webhook disponível em http://localhost:${PORT}/webhook/api/:instanceName`);
});

export default app;

