import type { AdminEventFilter } from '@siyasat/core';
import { TriangleAlert } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Empty, Spinner } from '../../components/bits';
import { EventList, Pager } from '../../components/admin/parts';
import { useLoad } from '../../components/admin/useLoad';
import { adminApi } from '../../lib/api';

const FILTERS: Record<AdminEventFilter, string> = {
  all: 'Everything',
  signups: 'Sign-ups',
  signins: 'Sign-ins',
  failed: 'Failed & blocked',
  admin: 'Admin actions',
};

export function AdminActivity() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('type') ?? '';
  const type: AdminEventFilter = raw in FILTERS ? (raw as AdminEventFilter) : 'all';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const { data, error, loading } = useLoad(() => adminApi.events(type, page), `${type}:${page}`, 60_000);

  const go = (nextType: AdminEventFilter, nextPage: number) => {
    const next = new URLSearchParams();
    if (nextType !== 'all') next.set('type', nextType);
    if (nextPage > 1) next.set('page', String(nextPage));
    setParams(next, { replace: true });
  };

  return (
    <section className="card" aria-labelledby="activity-h">
      <div className="rowh">
        <div>
          <h2 className="card-h" id="activity-h">
            Activity log
          </h2>
          <p className="help">Every sign-up, sign-in and admin action, newest first, with the address and browser it came from. Kept for a year.</p>
        </div>
        <div className="seg" role="group" aria-label="Show">
          {(Object.keys(FILTERS) as AdminEventFilter[]).map((k) => (
            <button key={k} type="button" aria-pressed={type === k} onClick={() => go(k, 1)}>
              {FILTERS[k]}
            </button>
          ))}
        </div>
      </div>
      {!data ? (
        error ? (
          <Empty icon={TriangleAlert} title="Couldn’t load the activity log">
            {error}
          </Empty>
        ) : (
          <div className="boot short" role="status">
            <Spinner /> Loading activity…
          </div>
        )
      ) : (
        <div className={loading ? 'refreshing' : ''}>
          <EventList events={data.events} empty={type === 'all' ? 'Nothing has happened yet.' : 'Nothing of this kind yet.'} />
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => go(type, p)} noun="events" />
        </div>
      )}
    </section>
  );
}
