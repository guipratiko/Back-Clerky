import { Router } from 'express';
import {
  createInstance,
  getInstances,
  getInstance,
  updateInstanceSettings,
  deleteInstance,
} from '../controllers/instanceController';
import { protect } from '../middleware/auth';

const router = Router();

// Todas as rotas requerem autenticação
router.post('/', protect, createInstance);
router.get('/', protect, getInstances);
router.get('/:id', protect, getInstance);
router.put('/:id/settings', protect, updateInstanceSettings);
router.delete('/:id', protect, deleteInstance);

export default router;

