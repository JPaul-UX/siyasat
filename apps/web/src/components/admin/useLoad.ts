import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';

/**
 * Load something for an admin page, again whenever `key` changes, and every `refreshMs` while the page is
 * open. A reload keeps showing the last answer until the new one arrives.
 */
export function useLoad<T>(load: () => Promise<T>, key: string, refreshMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loader = useRef(load);
  loader.current = load;
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const ticket = ++latest.current;
    setLoading(true);
    try {
      const value = await loader.current();
      if (ticket !== latest.current) return;
      setData(value);
      setError(null);
    } catch (e) {
      if (ticket !== latest.current) return;
      setError(e instanceof ApiError ? e.message : 'Siyasat can’t be reached. Check your connection and try again.');
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    if (!refreshMs) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, refreshMs);
    return () => clearInterval(timer);
  }, [key, refreshMs, reload]);

  return { data, setData, error, loading, reload };
}
