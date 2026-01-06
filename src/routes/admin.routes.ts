import { Router } from 'express';
import { protect } from '../middleware/auth';
import { sendPromotion } from '../controllers/adminController';

const router = Router();

// Todas as rotas requerem autenticação
router.use(protect);

// Enviar notificação promocional
router.post('/send-promotion', sendPromotion);

export default router;

