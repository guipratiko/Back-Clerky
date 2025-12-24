import { Router } from 'express';
import { protect } from '../middleware/auth';
import { getDashboardStats } from '../controllers/dashboardController';

const router = Router();

// Todas as rotas requerem autenticação
router.use(protect);

router.get('/stats', getDashboardStats);

export default router;

