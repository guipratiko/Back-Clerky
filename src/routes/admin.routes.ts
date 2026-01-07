import { Router } from 'express';
import { protect, requireAdmin } from '../middleware/auth';
import { sendPromotion } from '../controllers/adminController';

const router = Router();

// Todas as rotas requerem autenticação e privilégios de admin
router.use(protect);
router.use(requireAdmin);

// Enviar notificação promocional
router.post('/send-promotion', sendPromotion);

export default router;

