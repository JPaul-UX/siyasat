import type { Account, AccountResponse } from '@siyasat/core';

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
  return `Request failed (${res.status})`;
}

async function send(path: string, body?: unknown): Promise<Account> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new AuthError(res.status, await readError(res));
  const data = (await res.json()) as AccountResponse;
  if (!data.user) throw new AuthError(res.status, 'Sign-in did not start');
  return data.user;
}

/** The signed-in account, or null. Does not send the browser to the login page. */
export async function fetchSession(): Promise<Account | null> {
  const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (res.status === 401) return null;
  if (!res.ok) throw new AuthError(res.status, await readError(res));
  const data = (await res.json()) as AccountResponse;
  return data.user;
}

export const login = (email: string, password: string) => send('/api/auth/login', { email, password });

export const signup = (input: { name: string; email: string; password: string; note: string }) => send('/api/auth/signup', input);

export async function listAccounts(): Promise<Account[]> {
  const res = await fetch('/api/admin/users', { credentials: 'same-origin' });
  if (!res.ok) throw new AuthError(res.status, await readError(res));
  const data = (await res.json()) as { users: Account[] };
  return data.users;
}

export async function setAccountStatus(id: string, action: 'approve' | 'reject' | 'revoke'): Promise<Account> {
  const res = await fetch(`/api/admin/users/${id}/${action}`, { method: 'POST', credentials: 'same-origin' });
  if (!res.ok) throw new AuthError(res.status, await readError(res));
  return (await res.json()) as Account;
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.assign('/');
}

/** Only same-site paths. Anything else goes to the dashboard. */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/login') || raw.startsWith('/signup') || raw.startsWith('/pending')) {
    return '/dashboard';
  }
  return raw;
}
