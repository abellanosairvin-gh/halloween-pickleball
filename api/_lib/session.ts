import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Settings the API reads from the environment; passed in so tests can supply their own. */
export interface ServerEnv {
  ORGANIZER_PASSWORD?: string;
  SESSION_SECRET?: string;
}

export const COOKIE_NAME = 'hpp_organizer';
/** Long enough to cover setup the day before and the whole party. */
export const SESSION_SECONDS = 3 * 24 * 60 * 60;

const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('base64url');

function sameText(a: string, b: string): boolean {
  // Compare digests so neither the length nor the content leaks through timing.
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function checkPassword(env: ServerEnv, password: string): boolean {
  if (!env.ORGANIZER_PASSWORD) throw new Error('ORGANIZER_PASSWORD is not set.');
  return sameText(password, env.ORGANIZER_PASSWORD);
}

/** A signed token holding only its expiry time: the organizer is the only kind of signed-in user. */
export function createSessionToken(env: ServerEnv, now = Date.now()): string {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET is not set.');
  const payload = String(now + SESSION_SECONDS * 1000);
  return `${payload}.${sign(payload, env.SESSION_SECRET)}`;
}

export function isValidSessionToken(env: ServerEnv, token: string | undefined, now = Date.now()): boolean {
  if (!token || !env.SESSION_SECRET) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !sameText(signature, sign(payload, env.SESSION_SECRET))) return false;
  return Number(payload) > now;
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export function sessionCookie(request: Request, token: string | null): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  const value = token ?? '';
  const maxAge = token ? SESSION_SECONDS : 0;
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function isOrganizer(request: Request, env: ServerEnv): boolean {
  return isValidSessionToken(env, readCookie(request, COOKIE_NAME));
}
