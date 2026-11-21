import type { Account } from '@siyasat/core';
import { create } from 'zustand';
import { fetchMe, logoutRequest } from '../lib/auth';
import { go } from '../lib/nav';
import { resetChecks } from './checks';

interface SessionState {
  status: 'loading' | 'ready';
  user: Account | null;
}

export const useSession = create<SessionState>(() => ({ status: 'loading', user: null }));

export async function loadSession(): Promise<void> {
  try {
    const user = await fetchMe();
    useSession.setState({ status: 'ready', user });
  } catch {
    useSession.setState({ status: 'ready', user: null });
  }
}

export async function logout(): Promise<void> {
  try {
    await logoutRequest();
  } catch {
    /* The cookie is cleared locally even if the network call failed. */
  }
  resetChecks();
  useSession.setState({ status: 'ready', user: null });
  go('/');
}
