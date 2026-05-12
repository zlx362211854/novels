import { Request, Response, NextFunction } from 'express';
import { readSession } from '../services/authService';

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = readSession(req.headers.cookie);
  if (!session) {
    return res.status(401).json({ error: '未登录或登录已过期' });
  }
  (req as any).auth = { username: session.username };
  next();
}

export { requireAuth };
