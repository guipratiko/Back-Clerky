import { Router, Request, Response } from 'express';
import { receiveWebhook } from '../controllers/webhookController';

const router = Router();

// Rota para receber webhooks da Evolution API
// Formato: POST /webhook/api/:instanceName
router.post('/api/:instanceName', receiveWebhook);

// Rota GET para verificação (algumas APIs fazem verificação)
router.get('/api/:instanceName', (req: Request, res: Response) => {
  console.log(`🔍 Verificação GET recebida para: ${req.params.instanceName}`);
  res.status(200).json({ status: 'ok', message: 'Webhook endpoint ativo' });
});

export default router;

