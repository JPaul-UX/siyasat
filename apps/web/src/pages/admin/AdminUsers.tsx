import type { AdminUserSort, UserStatus } from '@siyasat/core';
import { Search, TriangleAlert, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Empty, Spinner } from '../../components/bits';
import { Ago, Avatar, Pager, UserPills } from '../../components/admin/parts';
import { useLoad } from '../../components/admin/useLoad';
import { adminApi } from '../../lib/api';
import { paths } from '../../lib/nav';

const SORTS: Record<AdminUserSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  active: 'Recently active',
  lookups: 'Most lookups (7 days)',
  throttled: 'Most rate-limited (7 days)',
};

const STATUSES: [UserStatus | '', string][] = [
  ['', 'All'],
  ['active', 'Active'],
  ['suspended', 'Suspended'],
];

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function AdminUsers() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = (params.get('status') ?? '') as UserStatus | '';
  const rawSort = params.get('sort') ?? '';
  const sort: AdminUserSort = rawSort in SORTS ? (rawSort as AdminUserSort) : 'newest';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [typed, setTyped] = useState(q);

  const update = (changes: Record<string, string | number | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '' || (k === 'page' && v === 1) || (k === 'sort' && v === 'newest')) next.delete(k);
      else next.set(k, String(v));
    }
    setParams(next, { replace: true });
  };

  // Search as the admin types, once they pause.
  useEffect(() => {
    if (typed === q) return;
    const timer = setTimeout(() => update({ q: typed.trim(), page: 1 }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  const key = JSON.stringify({ q, status, sort, page });
  const { data, error, loading } = useLoad(() => adminApi.users({ q: q || undefined, status: status || undefined, sort, page }), key);

  return (
    <section className="card ucard" aria-labelledby="users-h">
      <h2 className="sr" id="users-h">
        Accounts
      </h2>
      <div className="utools">
        <label className="usearch">
          <Search aria-hidden="true" />
          <span className="sr">Search accounts</span>
          <input type="search" placeholder="Search by name, email or IP address" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </label>
        <div className="seg" role="group" aria-label="Status">
          {STATUSES.map(([value, label]) => (
            <button key={label} type="button" aria-pressed={status === value} onClick={() => update({ status: value, page: 1 })}>
              {label}
            </button>
          ))}
        </div>
        <label className="usort">
          <span className="sr">Sort by</span>
          <select value={sort} onChange={(e) => update({ sort: e.target.value, page: 1 })}>
            {(Object.keys(SORTS) as AdminUserSort[]).map((k) => (
              <option key={k} value={k}>
                {SORTS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!data ? (
        error ? (
          <Empty icon={TriangleAlert} title="Couldn’t load accounts">
            {error}
          </Empty>
        ) : (
          <div className="boot short" role="status">
            <Spinner /> Loading accounts…
          </div>
        )
      ) : !data.users.length ? (
        <Empty icon={Users} title={q || status ? 'No accounts match' : 'No accounts yet'}>
          {q || status ? 'Try another search, or show every status.' : 'Accounts appear here as people sign up.'}
        </Empty>
      ) : (
        <div className={`utable-wrap${loading ? ' refreshing' : ''}`}>
          <table className="utable">
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col">Signed up</th>
                <th scope="col">Last active</th>
                <th scope="col" className="num">
                  Checks
                </th>
                <th scope="col" className="num">
                  Lookups <small>7 days</small>
                </th>
                <th scope="col" className="num">
                  Rate-limited <small>7 days</small>
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr
                  key={u.id}
                  onClick={(e) => {
                    // The whole row opens the account; the link inside it is there for keyboards and screen readers.
                    if (!(e.target as HTMLElement).closest('a')) navigate(paths.adminUser(u.id));
                  }}
                >
                  <td className="acct">
                    <div className="acct-in">
                      <Avatar name={u.name} admin={u.role === 'super_admin'} size={34} />
                      <div>
                        <Link to={paths.adminUser(u.id)}>
                          <b>{u.name}</b>
                        </Link>
                        <small>{u.email}</small>
                      </div>
                    </div>
                  </td>
                  <td data-label="Signed up">
                    <time dateTime={u.createdAt}>{shortDate(u.createdAt)}</time>
                    <small>
                      {u.signupIp ? <span className="mono">{u.signupIp}</span> : '—'}
                      {u.signupDevice ? ` · ${u.signupDevice}` : ''}
                    </small>
                  </td>
                  <td data-label="Last active">
                    <Ago iso={u.lastSeenAt} />
                  </td>
                  <td className="num" data-label="Checks">
                    {u.checks.toLocaleString()}
                  </td>
                  <td className="num" data-label="Lookups · 7d">
                    {u.lookups7d.toLocaleString()}
                  </td>
                  <td className={`num${u.throttled7d ? ' hot' : ''}`} data-label="Rate-limited · 7d">
                    {u.throttled7d.toLocaleString()}
                  </td>
                  <td data-label="Status">
                    <UserPills user={u} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => update({ page: p })} noun="accounts" />}
    </section>
  );
}
