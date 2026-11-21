import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';

export const SESSION_COOKIE = 'siyasat_session';
/** How long a login lasts. */
export const SESSION_MS = 14 * 24 * 60 * 60 * 1000;

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

/** The database id of a session token: its SHA-256, so the token itself is never stored. */
export function sessionKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function cookieOptions(secure: boolean): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
} {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: SESSION_MS };
}

export function writeSessionCookie(res: Response, token: string, secure: boolean): void {
  res.cookie(SESSION_COOKIE, token, cookieOptions(secure));
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  const { maxAge: _ignored, ...options } = cookieOptions(secure);
  res.clearCookie(SESSION_COOKIE, options);
}
