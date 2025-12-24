import { Router } from 'express';
import { protect } from '../middleware/auth';
import {
  getAllGroups,
  leaveGroup,
  validateParticipants,
  createGroup,
  updateGroupPicture,
  uploadGroupImage,
  updateGroupSubject,
  updateGroupDescription,
  getInviteCode,
  mentionEveryone,
} from '../controllers/groupController';

const router = Router();

// Todas as rotas requerem autenticação
router.use(protect);

router.get('/', getAllGroups);
router.get('/invite-code', getInviteCode);
router.post('/validate-participants', validateParticipants);
router.post('/create', createGroup);
router.post('/leave', leaveGroup);
router.post('/update-picture', uploadGroupImage, updateGroupPicture);
router.post('/update-subject', updateGroupSubject);
router.post('/update-description', updateGroupDescription);
router.post('/mention-everyone', mentionEveryone);

export default router;

