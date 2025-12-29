import { Router } from 'express';
import { protect, requirePremium } from '../middleware/auth';
import {
  getWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  getWorkflowContacts,
  clearWorkflowContacts,
  receiveTypebotWebhook,
} from '../controllers/workflowController';

const router = Router();

// Rota pública para webhook do Typebot (não requer autenticação)
router.post('/webhook/typebot/:nodeId', receiveTypebotWebhook);

// Todas as outras rotas requerem autenticação e plano premium
router.use(protect, requirePremium);

// Rotas de workflows
router.get('/', getWorkflows);
router.get('/:id', getWorkflow);
router.post('/', createWorkflow);
router.put('/:id', updateWorkflow);
router.delete('/:id', deleteWorkflow);

// Rotas de contatos do workflow
router.get('/:id/contacts', getWorkflowContacts);
router.post('/:id/contacts/clear', clearWorkflowContacts);

export default router;

