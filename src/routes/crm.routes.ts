import { Router } from 'express';
import {
  getColumns,
  updateColumn,
  getContacts,
  moveContact,
  searchContacts,
} from '../controllers/crmController';
import {
  getLabels,
  updateLabel,
  addLabelToContact,
  removeLabelFromContact,
} from '../controllers/labelController';
import { getMessages, sendMessage, sendMedia, sendAudio, uploadMedia } from '../controllers/messageController';
import { protect } from '../middleware/auth';

const router = Router();

// Todas as rotas requerem autenticação
router.use(protect);

// Rotas de Colunas
router.get('/columns', getColumns);
router.put('/columns/:id', updateColumn);

// Rotas de Labels
router.get('/labels', getLabels);
router.put('/labels/:id', updateLabel);
router.post('/contacts/:contactId/labels', addLabelToContact);
router.delete('/contacts/:contactId/labels/:labelId', removeLabelFromContact);

// Rotas de Contatos
router.get('/contacts', getContacts);
router.get('/contacts/search', searchContacts);
router.put('/contacts/:id/move', moveContact);

// Rotas de Mensagens
router.get('/contacts/:contactId/messages', getMessages);
router.post('/contacts/:contactId/messages', sendMessage);
router.post('/contacts/:contactId/messages/media', uploadMedia, sendMedia);
router.post('/contacts/:contactId/messages/audio', uploadMedia, sendAudio);

export default router;

