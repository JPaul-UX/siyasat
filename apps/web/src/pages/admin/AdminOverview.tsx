import type { AdminOverview } from '@siyasat/core';
import { ArrowRight, DoorClosed, Gauge, KeyRound, RefreshCw, TriangleAlert, UserPlus, Users, Zap } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Empty, Spinner } from '../../components/bits';
import { BarChart, SERIES_COLORS, type ChartSeries } from '../../components/admin/BarChart';
import { Ago, Avatar, EventList, UserPills } from '../../components/admin/parts';
import { useLoad } from '../../components/admin/useLoad';
import { adminApi } from '../../lib/api';
import { paths } from '../../lib/nav';
import { toggleSignups, useAdminSettings } from '../../store/admin';

type Metric = 'signups' | 'lookups' | 'active';

const METRICS: Record<Metric, { tab: string; title: string; help: string; series: ChartSeries[] }> = {
  signups: {
    tab: 'Sign-ups',
    title: 'New accounts per day',
    help: 'New accounts per day. A sudden spike from a few addresses is worth a look in Accounts.',
    series: [{ key: 'signups', label: 'Sign-ups', color: SERIES_COLORS.primary }],
  },
  lookups: {
    tab: 'Lookups',
    title: 'Lookups and rate-limited requests per day',
    help: 'Database lookups per day, and requests refused because an account went past its rate limit.',
    series: [
      { key: 'lookups', label: 'Lookups', color: SERIES_COLORS.primary },
      { key: 'throttled', label: 'Rate-limited', color: SERIES_COLORS.secondary },
    ],
  },
  active: {
    tab: 'Active',
    title: 'Accounts that made a lookup, per day',
    help: 'Accounts that made at least one lookup that day.',
    series: [{ key: 'activeUsers', label: 'Active accounts', color: SERIES_COLORS.primary }],
  },
};

function Stat({ icon: Icon, value, label, sub, tone }: { icon: typeof Users; value: number; label: string; sub?: ReactNode; tone?: 'warn' | 'bad' }) {
  return (
    <div className={`stat astat${tone ? ' ' + tone : ''}`}>
      <span className="si" aria-hidden="true">
        <Icon />
      </span>
      <b className="n">{value.toLocaleString()}</b>
      <span className="l">
        {label}
        {sub && <small>{sub}</small>}
      </span>
    </div>
  );
}

function Tiles({ t }: { t: AdminOverview['totals'] }) {
  return (
    <div className="stats astats">
      <Stat icon={Users} value={t.users} label="Accounts" sub={`${t.new7d.toLocaleString()} new this week${t.suspended ? ` · ${t.suspended} suspended` : ''}`} />
      <Stat icon={UserPlus} value={t.newToday} label="New today" sub="Accounts created" />
      <Stat icon={Gauge} value={t.activeToday} label="Active today" sub={`${t.activeSessions.toLocaleString()} signed-in sessions`} />
      <Stat icon={Zap} value={t.lookupsToday} label="Lookups today" sub={`${t.checks.toLocaleString()} checks saved in all`} />
      <Stat icon={TriangleAlert} value={t.throttledToday} label="Rate-limited today" sub="Requests refused" tone={t.throttledToday ? 'warn' : undefined} />
      <Stat
        icon={KeyRound}
        value={t.failedSignIns24h}
        label="Failed sign-ins"
        sub={`Last 24 h${t.blockedSignUps24h ? ` · ${t.blockedSignUps24h} blocked sign-ups` : ''}`}
        tone={t.failedSignIns24h + t.blockedSignUps24h ? 'bad' : undefined}
      />
    </div>
  );
}

export function AdminOverviewPage() {
  const { data, error, loading, reload } = useLoad(adminApi.overview, 'overview', 60_000);
  const signupsOpen = useAdminSettings((s) => s.signupsOpen);
  const [metric, setMetric] = useState<Metric>('signups');

  if (!data) {
    return error ? (
      <section className="card">
        <Empty icon={TriangleAlert} title="Couldn’t load the dashboard">
          {error}
          <div className="actions">
            <button type="button" className="primary" onClick={() => void reload()}>
              Try again
            </button>
          </div>
        </Empty>
      </section>
    ) : (
      <div className="boot" role="status">
        <Spinner /> Loading the dashboard…
      </div>
    );
  }

  const m = METRICS[metric];
  const maxTop = Math.max(1, ...data.topToday.map((u) => u.lookups + u.throttled));

  return (
    <div className={`admin-body${loading ? ' refreshing' : ''}`}>
      {signupsOpen === false && (
        <div className="oneline admin-alert">
          <DoorClosed className="ic" aria-hidden="true" />
          <span>New sign-ups are paused. People who already have an account can still sign in.</span>
          <button type="button" className="ghost sm" onClick={() => void toggleSignups()}>
            Open sign-ups
          </button>
        </div>
      )}

      <Tiles t={data.totals} />

      <section className="card" aria-labelledby="trend-h">
        <div className="rowh">
          <div>
            <h2 className="card-h" id="trend-h">
              Last 30 days
            </h2>
            <p className="help">{m.help}</p>
          </div>
          <div className="seg" role="group" aria-label="What to chart">
            {(Object.keys(METRICS) as Metric[]).map((k) => (
              <button key={k} type="button" aria-pressed={metric === k} onClick={() => setMetric(k)}>
                {METRICS[k].tab}
              </button>
            ))}
          </div>
        </div>
        <BarChart
          title={m.title}
          days={data.daily.map((d) => d.day)}
          series={m.series}
          value={(i, key) => (data.daily[i] as unknown as Record<string, number>)[key] ?? 0}
        />
        <p className="chart-foot">
          Days run midnight to midnight, {data.timeZone.replace(/_/g, ' ')} time. Updated every minute.
          <button type="button" className="link" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className="ic" aria-hidden="true" /> Refresh
          </button>
        </p>
      </section>

      <div className="admin-grid">
        <section className="card" aria-labelledby="newest-h">
          <div className="rowh">
            <h2 className="card-h" id="newest-h">
              Newest accounts
            </h2>
            <Link className="more" to={paths.adminUsers}>
              All accounts <ArrowRight className="ic" aria-hidden="true" />
            </Link>
          </div>
          {data.newest.length ? (
            <ul className="people">
              {data.newest.map((u) => (
                <li key={u.id}>
                  <Avatar name={u.name} admin={u.role === 'super_admin'} />
                  <div className="who">
                    <Link to={paths.adminUser(u.id)}>
                      <b>{u.name}</b>
                    </Link>
                    <small>{u.email}</small>
                  </div>
                  <div className="when">
                    <Ago iso={u.createdAt} />
                    <small>
                      {u.signupIp ? <span className="mono">{u.signupIp}</span> : 'Unknown address'}
                      {u.signupDevice ? ` · ${u.signupDevice}` : ''}
                    </small>
                  </div>
                  {u.status === 'suspended' && <UserPills user={u} />}
                </li>
              ))}
            </ul>
          ) : (
            <p className="quiet">No accounts yet.</p>
          )}
        </section>

        <section className="card" aria-labelledby="top-h">
          <div className="rowh">
            <h2 className="card-h" id="top-h">
              Most lookups today
            </h2>
            <Link className="more" to={`${paths.adminUsers}?sort=lookups`}>
              By last 7 days <ArrowRight className="ic" aria-hidden="true" />
            </Link>
          </div>
          {data.topToday.length ? (
            <ul className="leaders">
              {data.topToday.map((u) => (
                <li key={u.id}>
                  <div className="who">
                    <Link to={paths.adminUser(u.id)}>
                      <b>{u.name}</b>
                    </Link>
                    <small>{u.email}</small>
                  </div>
                  <div className="lbar" aria-hidden="true">
                    <i style={{ width: `${(u.lookups / maxTop) * 100}%`, background: SERIES_COLORS.primary }} />
                    {u.throttled > 0 && <i style={{ width: `${(u.throttled / maxTop) * 100}%`, background: SERIES_COLORS.secondary }} />}
                  </div>
                  <div className="nums">
                    <b>{u.lookups.toLocaleString()}</b>
                    {u.throttled > 0 ? <span className="pill wait">{u.throttled.toLocaleString()} rate-limited</span> : <small>lookups</small>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="quiet">No lookups yet today.</p>
          )}
        </section>
      </div>

      <section className="card" aria-labelledby="recent-h">
        <div className="rowh">
          <h2 className="card-h" id="recent-h">
            Recent activity
          </h2>
          <Link className="more" to={paths.adminActivity}>
            All activity <ArrowRight className="ic" aria-hidden="true" />
          </Link>
        </div>
        <EventList events={data.recent} />
      </section>
    </div>
  );
}
