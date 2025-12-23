import { Router } from 'express';
import { protect } from '../middleware/auth';
import {
  googleAuth,
  googleAuthCallback,
  createSpreadsheet,
  testGoogleConnection,
  listSpreadsheets,
} from '../controllers/googleController';

const router = Router();

// Rota pública para callback do OAuth
router.get('/auth/callback', googleAuthCallback);

// Rotas protegidas
router.use(protect);
router.get('/auth', googleAuth);
router.get('/test', testGoogleConnection);
router.post('/spreadsheet', createSpreadsheet);
router.get('/spreadsheets', listSpreadsheets);

export default router;

