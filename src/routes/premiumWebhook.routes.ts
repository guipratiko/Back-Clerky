import { Router } from 'express';
import { receivePremiumWebhook } from '../controllers/premiumWebhookController';

const router = Router();

// Rota pública para receber webhook de compra premium
router.post('/premium-purchase', receivePremiumWebhook);

export default router;


