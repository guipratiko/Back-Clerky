import { Router } from 'express';
import { protect, requirePremium } from '../middleware/auth';
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
  getGroupParticipants,
  updateGroupSettings,
  mentionEveryone,
} from '../controllers/groupController';

const router = Router();

// Todas as rotas requerem autenticação e plano premium
router.use(protect, requirePremium);

router.get('/', getAllGroups);
router.get('/invite-code', getInviteCode);
router.get('/participants', getGroupParticipants);
router.post('/validate-participants', validateParticipants);
router.post('/create', createGroup);
router.post('/leave', leaveGroup);
router.post('/update-picture', uploadGroupImage, updateGroupPicture);
router.post('/update-subject', updateGroupSubject);
router.post('/update-description', updateGroupDescription);
router.post('/update-settings', updateGroupSettings);
router.post('/mention-everyone', mentionEveryone);

export default router;

