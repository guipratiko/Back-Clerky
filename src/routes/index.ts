import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import instanceRoutes from './instance.routes';
import crmRoutes from './crm.routes';
import workflowRoutes from './workflow.routes';
import googleRoutes from './google.routes';
import aiAgentRoutes from './aiAgent.routes';
import groupRoutes from './group.routes';
import dashboardRoutes from './dashboard.routes';
import premiumWebhookRoutes from './premiumWebhook.routes';
import subscriptionRoutes from './subscription.routes';
import adminRoutes from './admin.routes';
import { dispatchProxy } from '../middleware/dispatchProxy';
import { protect, requirePremium } from '../middleware/auth';

const router = Router();

// Rotas
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/webhook', premiumWebhookRoutes); // Webhook de compra premium (público)
router.use('/instances', instanceRoutes);
router.use('/crm', crmRoutes);
// Proxy para microserviço de disparos - requer autenticação e plano premium
router.use('/dispatches', protect, requirePremium, dispatchProxy);
router.use('/workflows', workflowRoutes);
router.use('/google', googleRoutes);
router.use('/ai-agent', aiAgentRoutes);
router.use('/groups', groupRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/admin', adminRoutes);

export default router;

