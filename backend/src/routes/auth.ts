import { Router, Request, Response } from 'express';
import {
  AUTH_COOKIE_NAME,
  getCookieOptions,
  getSessionCookieValue,
  readSession,
  validateCredentials,
} from '../services/authService';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  const user = await validateCredentials(username, password);
  if (!user) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const cookieValue = getSessionCookieValue({
    userId: user.id,
    username: user.username,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  res.cookie(AUTH_COOKIE_NAME, cookieValue, getCookieOptions());
  res.json({ ok: true, username: user.username, userId: user.id });
});

router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie(AUTH_COOKIE_NAME, {
    ...getCookieOptions(),
    maxAge: undefined,
  });
  res.json({ ok: true });
});

router.get('/me', (req: Request, res: Response) => {
  const session = readSession(req.headers.cookie);
  if (!session) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({ authenticated: true, username: session.username, userId: session.userId });
});

export default router;
