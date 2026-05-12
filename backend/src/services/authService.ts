import { createHmac, timingSafeEqual } from 'crypto';

const AUTH_COOKIE_NAME = 'novels_admin_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface SessionPayload {
  username: string;
  expiresAt: number;
}

function getAdminUsername(): string {
  return process.env.ADMIN_USERNAME || 'admin';
}

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || '123456aA';
}

function getSessionSecret(): string {
  return process.env.AUTH_SESSION_SECRET || 'novels-dev-session-secret';
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(payload: string): string {
  return createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

function getCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production' && process.env.AUTH_COOKIE_SECURE === 'true',
    path: '/',
    maxAge: SESSION_TTL_MS,
  };
}

function parseCookieHeader(cookieHeader?: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, pair) => {
    const index = pair.indexOf('=');
    if (index <= 0) return acc;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function getSessionCookieValue(payload: SessionPayload): string {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function readSession(cookieHeader?: string | null): SessionPayload | null {
  const cookies = parseCookieHeader(cookieHeader);
  const raw = cookies[AUTH_COOKIE_NAME];
  if (!raw) return null;

  const separatorIndex = raw.lastIndexOf('.');
  if (separatorIndex <= 0) return null;

  const encodedPayload = raw.slice(0, separatorIndex);
  const providedSignature = raw.slice(separatorIndex + 1);
  const expectedSignature = sign(encodedPayload);
  if (!safeEqual(providedSignature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    if (!payload?.username || !payload?.expiresAt) return null;
    if (payload.expiresAt <= Date.now()) return null;
    if (payload.username !== getAdminUsername()) return null;
    return payload;
  } catch {
    return null;
  }
}

function validateCredentials(username: string, password: string): boolean {
  return username === getAdminUsername() && password === getAdminPassword();
}

export {
  AUTH_COOKIE_NAME,
  getAdminUsername,
  getCookieOptions,
  getSessionCookieValue,
  parseCookieHeader,
  readSession,
  validateCredentials,
};
