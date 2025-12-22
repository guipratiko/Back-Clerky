import { Router } from 'express';
import { login, register, getMe, updateProfile, changePassword } from '../controllers/authController';
import { protect } from '../middleware/auth';

const router = Router();

// Rotas públicas
router.post('/login', login);
router.post('/register', register);

// Rotas protegidas
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.put('/password', protect, changePassword);

export default router;

