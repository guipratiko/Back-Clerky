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
import { dispatchProxy } from '../middleware/dispatchProxy';

const router = Router();

// Rotas
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/instances', instanceRoutes);
router.use('/crm', crmRoutes);
// Proxy para microserviço de disparos
router.use('/dispatches', dispatchProxy);
router.use('/workflows', workflowRoutes);
router.use('/google', googleRoutes);
router.use('/ai-agent', aiAgentRoutes);
router.use('/groups', groupRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;

