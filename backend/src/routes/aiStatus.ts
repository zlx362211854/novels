import { Router, Request, Response } from 'express';
import * as aiStatusService from '../services/aiStatusService';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const status = aiStatusService.getCurrent();
  res.json(status);
});

router.get('/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const onUpdate = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  aiStatusService.emitter.on('update', onUpdate);

  req.on('close', () => {
    aiStatusService.emitter.off('update', onUpdate);
  });
});

export default router;