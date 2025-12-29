import { Router } from 'express';
import { login, register, getMe, updateProfile, changePassword, forgotPassword, resetPassword } from '../controllers/authController';
import { validateActivationToken, activateAccount } from '../controllers/activateAccountController';
import { protect } from '../middleware/auth';

const router = Router();

// Rotas públicas
router.post('/login', login);
router.post('/register', register);
router.get('/activate', validateActivationToken); // Validar token de ativação
router.post('/activate', activateAccount); // Ativar conta (definir senha)
router.post('/forgot-password', forgotPassword); // Solicitar recuperação de senha
router.post('/reset-password', resetPassword); // Redefinir senha com token

// Rotas protegidas
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.put('/password', protect, changePassword);

export default router;

