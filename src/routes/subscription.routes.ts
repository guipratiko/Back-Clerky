import { Router } from 'express';
import { protect } from '../middleware/auth';
import { SERVER_CONFIG } from '../config/constants';
import {
  validateSubscription,
  getActiveSubscriptionEndpoint,
  registerDeviceToken,
  removeDeviceToken,
  broadcastPushToAllIOS,
} from '../controllers/subscriptionController';

const router = Router();

// Rota de teste sem autenticação (apenas em desenvolvimento)
if (SERVER_CONFIG.NODE_ENV === 'development') {
  router.post('/push/broadcast-test', broadcastPushToAllIOS);
  console.log('⚠️ Rota de teste /api/subscriptions/push/broadcast-test habilitada (apenas desenvolvimento)');
}

// Todas as rotas requerem autenticação
router.use(protect);

// Validar assinatura da Apple
router.post('/validate', validateSubscription);

// Obter assinatura ativa
router.get('/active', getActiveSubscriptionEndpoint);

// Registrar device token para push notifications
router.post('/device-token', registerDeviceToken);

// Remover device token
router.delete('/device-token/:token', removeDeviceToken);

// Enviar push para todos os usuários iOS (teste)
router.post('/push/broadcast', broadcastPushToAllIOS);

export default router;

