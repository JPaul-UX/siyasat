import { createHash } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';

/** Name of the httpOnly login cookie. */
export const SESSION_COOKIE = 'siyasat_session';

/** How long a login lasts. Matches the cookie and the row in the database. */
export const SESSION_MS = 14 * 24 * 60 * 60 * 1000;

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/**
 * httpOnly so page scripts cannot read the login. Secure only when the request itself is HTTPS
 * (Railway), so a local http://localhost login still sticks.
 */
export function sessionCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MS,
  };
}

export function setSessionCookie(res: Response, req: Request, token: string): void {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(req.secure));
}

export function clearSessionCookie(res: Response, req: Request): void {
  const { maxAge: _maxAge, ...options } = sessionCookieOptions(req.secure);
  res.clearCookie(SESSION_COOKIE, options);
}
