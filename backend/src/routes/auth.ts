import { Router, Request, Response } from 'express';
import {
  AUTH_COOKIE_NAME,
  getAdminUsername,
  getCookieOptions,
  getSessionCookieValue,
  readSession,
  validateCredentials,
} from '../services/authService';

const router = Router();

router.post('/login', (req: Request, res: Response) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!validateCredentials(username, password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const cookieValue = getSessionCookieValue({
    username: getAdminUsername(),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  res.cookie(AUTH_COOKIE_NAME, cookieValue, getCookieOptions());
  res.json({ ok: true, username: getAdminUsername() });
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
  res.json({ authenticated: true, username: session.username });
});

export default router;
