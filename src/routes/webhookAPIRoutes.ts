import { Router } from 'express';
import {
  sendText,
  sendImage,
  sendVideo,
  sendFile,
  sendAudio,
  moveContact,
  getContacts,
  getColumns,
  getLabels,
  addLabelToContact,
  removeLabelFromContact,
} from '../controllers/webhookAPIController';
import { authenticateInstance } from '../middleware/instanceAuth';

const router = Router();

// Todas as rotas requerem autenticação por token de instância
router.use(authenticateInstance);

// Rotas de envio de mensagens
router.post('/send-text', sendText);
router.post('/send-image', sendImage);
router.post('/send-video', sendVideo);
router.post('/send-file', sendFile);
router.post('/send-audio', sendAudio);

// Rotas de gerenciamento de CRM
router.post('/move-contact', moveContact);
router.get('/contacts', getContacts);
router.get('/columns', getColumns);

// Rotas de gerenciamento de Labels (Etiquetas)
router.get('/labels', getLabels);
router.post('/add-label', addLabelToContact);
router.post('/remove-label', removeLabelFromContact);

export default router;

