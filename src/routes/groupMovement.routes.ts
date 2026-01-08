import { Router } from 'express';
import { protect } from '../middleware/auth';
import {
  getGroupMovements,
  getGroupMovementsStatistics,
  upsertGroupAutoMessage,
  getGroupAutoMessages,
  updateGroupAutoMessage,
  deleteGroupAutoMessage,
  replaceGroupAutoMessages,
} from '../controllers/groupMovementController';

const router = Router();

// Todas as rotas requerem autenticação
router.use(protect);

// Rotas de movimentações
router.get('/movements', getGroupMovements);
router.get('/movements/statistics', getGroupMovementsStatistics);

// Rotas de mensagens automáticas
router.post('/auto-messages', upsertGroupAutoMessage);
router.get('/auto-messages', getGroupAutoMessages);
router.put('/auto-messages/:id', updateGroupAutoMessage);
router.delete('/auto-messages/:id', deleteGroupAutoMessage);
router.post('/auto-messages/replace-groups', replaceGroupAutoMessages);

export default router;
