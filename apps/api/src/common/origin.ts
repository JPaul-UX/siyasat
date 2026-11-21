import type { NextFunction, Request, Response } from 'express';

/**
 * Cookie-authenticated writes should come from this site. A browser sends `Origin` on a POST from another
 * site; curl and same-origin navigations often send none, which is allowed. In local development the page
 * is on port 5173 and the API on 3000, so localhost ports are treated as the same site.
 */
export function isTrustedOrigin(req: Request): boolean {
  const origin = req.header('origin');
  if (!origin) return true;
  let originHost = '';
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const host = req.get('host') ?? '';
  if (originHost === host) return true;
  const bare = (value: string) => value.replace(/:\d+$/, '').toLowerCase();
  const local = (value: string) => bare(value) === 'localhost' || bare(value) === '127.0.0.1';
  return local(originHost) && local(host);
}

export function rejectCrossSiteMutations(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  if (isTrustedOrigin(req)) {
    next();
    return;
  }
  res.status(403).json({ statusCode: 403, message: 'Cross-site request blocked', error: 'Forbidden' });
}
