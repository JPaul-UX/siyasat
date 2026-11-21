/* Login, signup, and the session cookie. The cookie is httpOnly, so this file never sees the token. */
import type { Account, AdminUser } from '@siyasat/core';

export class AuthError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(' ');
    if (body.message) return body.message;
  } catch {
    /* not JSON */
  }
  return 'Something went wrong. Try again.';
}

async function send(path: string, body?: unknown): Promise<Response> {
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'include',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AuthError(0, "Siyasat can't be reached. Check your connection and try again.");
  }
  return res;
}

export async function fetchMe(): Promise<Account | null> {
  const res = await send('/auth/me');
  if (!res.ok) return null;
  const data = (await res.json()) as { user: Account | null };
  return data.user;
}

export async function signup(name: string, email: string, password: string): Promise<Account> {
  const res = await send('/auth/signup', { name, email, password });
  if (!res.ok) throw new AuthError(res.status, await readError(res));
  return ((await res.json()) as { user: Account }).user;
}

export async function login(email: string, password: string): Promise<Account> {
  const res = await send('/auth/login', { email, password });
  if (!res.ok) throw new AuthError(res.status, await readError(res));
  return ((await res.json()) as { user: Account }).user;
}

export async function logoutRequest(): Promise<void> {
  await send('/auth/logout', {});
}

export async function listUsers(): Promise<AdminUser[]> {
  const res = await send('/admin/users');
  if (!res.ok) throw new AuthError(res.status, await readError(res));
  return (await res.json()) as AdminUser[];
}

export async function setUserStatus(id: string, action: 'approve' | 'reject' | 'revoke'): Promise<AdminUser> {
  const res = await send(`/admin/users/${id}/${action}`, {});
  if (!res.ok) throw new AuthError(res.status, await readError(res));
  return (await res.json()) as AdminUser;
}

/** Only paths on this site. Refuses protocol-relative and external URLs. */
export function safeNext(search: string): string | null {
  const next = new URLSearchParams(search).get('next');
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;
  if (next === '/login' || next.startsWith('/login?') || next === '/signup' || next.startsWith('/signup?') || next === '/pending') return null;
  return next;
}
