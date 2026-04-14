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
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const clientId = Date.now();
  console.log(`[SSE] 客户端已连接 id=${clientId}`);

  // Send initial keepalive so the browser knows the connection is open
  res.write(': connected\n\n');

  // Send current task state if there is one
  const current = aiStatusService.getCurrent();
  if (current) {
    console.log(`[SSE] 推送当前任务状态 id=${clientId} status=${current.status}`);
    res.write(`data: ${JSON.stringify(current)}\n\n`);
  }

  const onUpdate = (data: any) => {
    console.log(`[SSE] 推送事件 id=${clientId} status=${data.status} step=${data.currentStepLabel}`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  aiStatusService.emitter.on('update', onUpdate);

  req.on('close', () => {
    console.log(`[SSE] 客户端断开 id=${clientId}`);
    aiStatusService.emitter.off('update', onUpdate);
  });
});

export default router;