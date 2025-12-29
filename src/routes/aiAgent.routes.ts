import { Router } from 'express';
import { protect, requirePremium } from '../middleware/auth';
import {
  createAIAgent,
  getAIAgents,
  getAIAgent,
  updateAIAgent,
  deleteAIAgent,
  getLeads,
  transcriptionCallback,
} from '../controllers/aiAgentController';

const router = Router();

// Rota pública para callback de transcrição
router.post('/transcription-callback', transcriptionCallback);

// Todas as outras rotas requerem autenticação e plano premium
router.use(protect, requirePremium);

// Rotas de agentes
router.post('/', createAIAgent);
router.get('/', getAIAgents);
router.get('/leads', getLeads);
router.get('/:id', getAIAgent);
router.put('/:id', updateAIAgent);
router.delete('/:id', deleteAIAgent);

export default router;

