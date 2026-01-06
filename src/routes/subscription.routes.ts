import { Router } from 'express';
import { protect } from '../middleware/auth';
import { SERVER_CONFIG } from '../config/constants';
import {
  validateSubscription,
  getActiveSubscriptionEndpoint,
  registerDeviceToken,
  removeDeviceToken,
  broadcastPushToAllIOS,
  sendPromotionalPushToAllIOS,
} from '../controllers/subscriptionController';

const router = Router();

// Rota de teste sem autenticação (apenas em desenvolvimento)
if (SERVER_CONFIG.NODE_ENV === 'development') {
  router.post('/push/broadcast-test', broadcastPushToAllIOS);
  router.post('/push/promotional-test', sendPromotionalPushToAllIOS);
  console.log('⚠️ Rotas de teste habilitadas (apenas desenvolvimento):');
  console.log('   - /api/subscriptions/push/broadcast-test');
  console.log('   - /api/subscriptions/push/promotional-test');
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

// Enviar push para todos os usuários iOS (teste/broadcast)
router.post('/push/broadcast', broadcastPushToAllIOS);

// Enviar notificação promocional para todos os usuários iOS
router.post('/push/promotional', sendPromotionalPushToAllIOS);

export default router;

