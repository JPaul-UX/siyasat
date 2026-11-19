/* Routes, and a way for code outside React (stores, background jobs) to navigate. */
import type { NavigateFunction } from 'react-router';
import type { CheckType } from '@siyasat/core';

let navigateFn: NavigateFunction | null = null;

export const setNavigate = (fn: NavigateFunction): void => {
  navigateFn = fn;
};

export const go = (to: string, options?: { replace?: boolean }): void => {
  navigateFn?.(to, options);
};

export const currentPath = (): string => window.location.pathname;

export const paths = {
  dashboard: '/',
  newCheck: (type?: CheckType) => (type ? `/new/${type}` : '/new'),
  results: (id?: string, refs = false) => (id ? `/results/${id}${refs ? '/refs' : ''}` : '/results'),
  reports: '/reports',
  how: '/how-it-works',
  upload: '/upload',
  read: (doi: string) => `/read?doi=${encodeURIComponent(doi)}`,
};

/* ---------- In-app history, for the Back button ---------- */

const HISTORY_KEY = 'siyasat.hist';
let trail: string[] = (() => {
  try {
    return JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '[]') as string[];
  } catch {
    return [];
  }
})();

/** Record a visit. Going back to the previous page shortens the trail instead of growing it. */
export function trackVisit(path: string): void {
  if (trail[trail.length - 1] === path) return;
  if (trail[trail.length - 2] === path) trail.pop();
  else trail.push(path);
  trail = trail.slice(-50);
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(trail));
  } catch {
    /* ignore */
  }
}

const TYPE_NAME: Record<CheckType, string> = { refs: 'Reference list', corpus: 'Review corpus', draft: 'Draft check' };
export const typeName = (t: CheckType): string => TYPE_NAME[t];

const section = (path: string) => path.split('?')[0]!.split('/')[1] || 'dashboard';

function pageName(path: string, from: string): string {
  const [, page, arg] = path.split('?')[0]!.split('/');
  if (page === 'new') {
    if (arg) return from.startsWith('/new') ? 'step 2' : 'New check';
    return from.startsWith('/new/') ? 'step 1' : 'New check';
  }
  return ({ results: 'Results', reports: 'Reports', read: 'Reader', upload: 'Upload' } as Record<string, string>)[page ?? ''] || 'Dashboard';
}

function parentOf(path: string): string {
  const [, page, arg] = path.split('?')[0]!.split('/');
  return page === 'new' && arg ? '/new' : page === 'read' ? '/results' : '/';
}

export interface BackTarget {
  to: string;
  /** Go there with the browser's own Back, so Forward keeps working. */
  viaHistory: boolean;
  label: string;
}

export function backTarget(current: string): BackTarget {
  const prev = trail.length > 1 ? trail[trail.length - 2]! : null;
  // The upload progress page is not somewhere to go back to.
  if (prev && section(prev) === 'upload' && section(current) !== 'upload') return { to: '/', viaHistory: false, label: 'Dashboard' };
  if (prev) return { to: prev, viaHistory: true, label: pageName(prev, current) };
  const parent = parentOf(current);
  return { to: parent, viaHistory: false, label: pageName(parent, current) };
}
