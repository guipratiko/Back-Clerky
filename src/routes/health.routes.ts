import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    message: 'Clerky API está funcionando',
    timestamp: new Date().toISOString()
  });
});

export default router;

