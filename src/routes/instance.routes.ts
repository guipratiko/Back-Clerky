import { Router } from 'express';
import {
  createInstance,
  getInstances,
  getInstance,
  updateInstanceSettings,
  deleteInstance,
} from '../controllers/instanceController';
import { protect, requirePremium } from '../middleware/auth';

const router = Router();

// Todas as rotas requerem autenticação e plano premium
router.use(protect, requirePremium);

router.post('/', createInstance);
router.get('/', getInstances);
router.get('/:id', getInstance);
router.put('/:id/settings', updateInstanceSettings);
router.delete('/:id', deleteInstance);

export default router;

