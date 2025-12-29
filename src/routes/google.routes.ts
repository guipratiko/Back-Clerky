import { Router } from 'express';
import { protect, requirePremium } from '../middleware/auth';
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

// Rotas protegidas - requerem autenticação e plano premium
router.use(protect, requirePremium);
router.get('/auth', googleAuth);
router.get('/test', testGoogleConnection);
router.post('/spreadsheet', createSpreadsheet);
router.get('/spreadsheets', listSpreadsheets);

export default router;

