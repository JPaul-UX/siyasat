/*
 * Who is signed in. The session itself is an httpOnly cookie the browser sends with every request; this
 * store only knows the account it belongs to, and whether there is one.
 */
import type { SessionUser } from '@siyasat/core';
import { create } from 'zustand';
import { ApiError, authApi, forgetLegacyWorkspace, legacyWorkspaceToken, type SessionProblem } from '../lib/api';
import { clearChecks } from './checks';
import { stopJob } from './jobs';
import { toast } from './toast';

interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in' | 'error';
  user: SessionUser | null;
  /** Set when a session ended while it was being used, so the sign-in page can say why it is showing. */
  ended: boolean;
}

export const useAuth = create<AuthState>(() => ({ status: 'loading', user: null, ended: false }));

export const isSuperAdmin = (user: SessionUser | null): boolean => user?.role === 'super_admin';

/** Signed in, but the super admin has not approved the account yet. */
export const isWaiting = (user: SessionUser | null): boolean => user?.status === 'pending';

export async function initAuth(): Promise<void> {
  useAuth.setState({ status: 'loading' });
  try {
    const { user } = await authApi.me();
    useAuth.setState({ status: 'signed-in', user, ended: false });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) useAuth.setState({ status: 'signed-out', user: null });
    else {
      console.error(e);
      useAuth.setState({ status: 'error' });
    }
  }
}

function signedIn(user: SessionUser, claimedChecks?: number): void {
  // The browser's anonymous workspace has been handed over (or was not wanted): it is not needed again.
  forgetLegacyWorkspace();
  clearChecks();
  useAuth.setState({ status: 'signed-in', user, ended: false });
  if (claimedChecks) {
    toast(`Added ${claimedChecks} saved check${claimedChecks === 1 ? '' : 's'} from this browser to your account`);
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  const { user, claimedChecks } = await authApi.signIn({ email, password, legacyWorkspaceToken: legacyWorkspaceToken() });
  signedIn(user, claimedChecks);
}

export async function signUp(name: string, email: string, password: string, website: string): Promise<void> {
  const { user, claimedChecks } = await authApi.signUp({ name, email, password, website, legacyWorkspaceToken: legacyWorkspaceToken() });
  signedIn(user, claimedChecks);
}

export async function signOut(): Promise<void> {
  stopJob('pause');
  try {
    await authApi.signOut();
  } catch (e) {
    console.error(e);
  }
  // A fresh page load clears everything the last account left in memory.
  window.location.assign('/signin');
}

/** Ask the server again who is signed in. The waiting page calls this to notice when the account is approved. */
export async function refreshMe(): Promise<void> {
  try {
    const { user } = await authApi.me();
    const before = useAuth.getState().user;
    useAuth.setState({ status: 'signed-in', user, ended: false });
    if (before?.status === 'pending' && user.status === 'active') {
      toast(`You’re approved. Welcome to Siyasat, ${user.name.split(/\s+/)[0]}!`);
    }
  } catch (e) {
    // Declined, or signed out elsewhere: back to the sign-in page. A dropped connection just waits for the next try.
    if (e instanceof ApiError && e.status === 401) {
      clearChecks();
      useAuth.setState({ status: 'signed-out', user: null, ended: true });
    }
  }
}

/** What to do when the server turns a request away. */
export function sessionProblem(problem: SessionProblem): void {
  if (problem === 'pending') void refreshMe();
  else sessionEnded();
}

/** The server no longer accepts this browser's session: it expired, was ended by an admin, or the account was suspended. */
export function sessionEnded(): void {
  if (useAuth.getState().status !== 'signed-in') return;
  stopJob('pause');
  clearChecks();
  useAuth.setState({ status: 'signed-out', user: null, ended: true });
}
