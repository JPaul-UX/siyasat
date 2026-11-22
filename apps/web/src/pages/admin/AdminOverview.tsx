import type { AdminOverview, AdminUserRow } from '@siyasat/core';
import { ArrowRight, CircleCheck, DoorClosed, Gauge, Hourglass, KeyRound, RefreshCw, TriangleAlert, Users, Zap } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Empty, Spinner } from '../../components/bits';
import { ApprovalButtons } from '../../components/admin/Approval';
import { BarChart, SERIES_COLORS, type ChartSeries } from '../../components/admin/BarChart';
import { Ago, Avatar, EventList, UserPills } from '../../components/admin/parts';
import { useLoad } from '../../components/admin/useLoad';
import { adminApi, ApiError } from '../../lib/api';
import { paths } from '../../lib/nav';
import { refreshPending, toggleSignups, useAdminSettings } from '../../store/admin';
import { confirmDialog } from '../../store/dialog';
import { toast } from '../../store/toast';

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
      <Stat
        icon={Users}
        value={t.users}
        label="Accounts"
        sub={`${t.newToday.toLocaleString()} new today · ${t.new7d.toLocaleString()} this week${t.suspended ? ` · ${t.suspended} suspended` : ''}`}
      />
      <Stat icon={Hourglass} value={t.pending} label="Waiting for approval" sub={t.pending ? 'Sign-ups to review' : 'Nobody waiting'} tone={t.pending ? 'warn' : undefined} />
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

/**
 * Sign-ups waiting for the super admin, oldest first, each with Approve and Decline. Approved and declined
 * rows leave the list at once; the rest of the page catches up on its next refresh.
 */
function ApprovalQueue({ pending, onChange }: { pending: AdminUserRow[]; onChange: () => void }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busyAll, setBusyAll] = useState(false);
  const waiting = pending.filter((u) => !done.has(u.id));

  const approveAll = async () => {
    const sure = await confirmDialog({
      title: `Approve all ${waiting.length} sign-ups?`,
      body: 'Everyone waiting gets in at once and can start checking references. Look through the list first if any address or device seems off.',
      confirmLabel: `Approve all ${waiting.length}`,
    });
    if (!sure) return;
    setBusyAll(true);
    try {
      const { approved } = await adminApi.approveAll();
      toast(`Approved ${approved} sign-up${approved === 1 ? '' : 's'}`);
      setDone(new Set(pending.map((u) => u.id)));
      void refreshPending();
      onChange();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't do that. Check your connection.");
    } finally {
      setBusyAll(false);
    }
  };

  return (
    <section className={`card queue${waiting.length ? ' has-waiting' : ''}`} aria-labelledby="queue-h">
      <div className="rowh">
        <div className="queue-title">
          <span className="queue-ic" aria-hidden="true">
            {waiting.length ? <Hourglass /> : <CircleCheck />}
          </span>
          <div>
            <h2 className="card-h" id="queue-h">
              {waiting.length ? `Waiting for approval (${waiting.length})` : 'No sign-ups waiting'}
            </h2>
            <p className="help">
              {waiting.length
                ? 'New accounts can sign in but can’t check references until you approve them.'
                : 'Every new account needs your approval. New sign-ups appear here.'}
            </p>
          </div>
        </div>
        {waiting.length > 1 && (
          <button type="button" className="approve sm" onClick={() => void approveAll()} disabled={busyAll}>
            {busyAll ? <Spinner /> : <CircleCheck className="ic" aria-hidden="true" />} Approve all {waiting.length}
          </button>
        )}
      </div>
      {waiting.length > 0 && (
        <ul className="people queue-list">
          {waiting.map((u) => (
            <li key={u.id}>
              <Avatar name={u.name} />
              <div className="who">
                <Link to={paths.adminUser(u.id)}>
                  <b>{u.name}</b>
                </Link>
                <small>{u.email}</small>
                <small className="queue-meta">
                  Signed up <Ago iso={u.createdAt} inline />
                  {' · '}
                  {u.signupIp ? <span className="mono">{u.signupIp}</span> : 'unknown address'}
                  {u.signupDevice ? ` · ${u.signupDevice}` : ''}
                </small>
              </div>
              <ApprovalButtons
                user={u}
                onDone={() => {
                  setDone((d) => new Set(d).add(u.id));
                  onChange();
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
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

      <ApprovalQueue pending={data.pending} onChange={() => void reload()} />

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
