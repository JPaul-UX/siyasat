import type { Account } from '@siyasat/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchSession } from './lib/auth';

interface SessionValue {
  ready: boolean;
  /** True when the account could not be loaded (the API did not answer). */
  offline: boolean;
  user: Account | null;
  setUser: (user: Account | null) => void;
  refresh: () => Promise<Account | null>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [user, setUser] = useState<Account | null>(null);

  const refresh = useCallback(async (): Promise<Account | null> => {
    try {
      const next = await fetchSession();
      setUser(next);
      setOffline(false);
      setReady(true);
      return next;
    } catch {
      setUser(null);
      setOffline(true);
      setReady(true);
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ ready, offline, user, setUser, refresh }), [ready, offline, user, refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
