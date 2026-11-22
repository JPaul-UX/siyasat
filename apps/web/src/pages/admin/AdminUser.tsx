import { LOOKUP_KINDS, type AdminUserDetail, type UsageKind } from '@siyasat/core';
import { ArrowLeft, Ban, CircleX, Hourglass, LockOpen, LogOut, MonitorSmartphone, TriangleAlert, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Empty, Spinner } from '../../components/bits';
import { ApprovalButtons } from '../../components/admin/Approval';
import { BarChart, SERIES_COLORS } from '../../components/admin/BarChart';
import { Ago, Avatar, EventList, UserPills } from '../../components/admin/parts';
import { useLoad } from '../../components/admin/useLoad';
import { adminApi, ApiError } from '../../lib/api';
import { fmtDate } from '../../lib/labels';
import { paths } from '../../lib/nav';
import { useAuth } from '../../store/auth';
import { confirmDialog } from '../../store/dialog';
import { toast } from '../../store/toast';

const KIND_LABEL: Record<UsageKind, string> = {
  verify: 'References checked',
  source: 'Draft sources checked',
  enrich: 'Venue lookups',
  journals: 'Journal abbreviations',
  fulltext: 'Full texts opened',
  throttled: 'Rate-limited requests',
};

type Action = 'suspend' | 'reactivate' | 'unlock' | 'signOutEverywhere';

export function AdminUserPage() {
  const { id = '' } = useParams();
  const me = useAuth((s) => s.user);
  const { data, setData, error } = useLoad(() => adminApi.user(id), id, 60_000);
  const [busy, setBusy] = useState<Action | null>(null);

  if (!data) {
    return error ? (
      <section className="card">
        <Empty icon={TriangleAlert} title="Couldn’t load this account">
          {error}
          <div className="actions">
            <Link className="btn ghost" to={paths.adminUsers}>
              <ArrowLeft className="ic" aria-hidden="true" /> All accounts
            </Link>
          </div>
        </Empty>
      </section>
    ) : (
      <div className="boot" role="status">
        <Spinner /> Loading the account…
      </div>
    );
  }

  const { user, sessions, usage, events } = data;
  const isMe = me?.id === user.id;
  const isAdmin = user.role === 'super_admin';

  const run = async (action: Action, done: string, confirm?: Parameters<typeof confirmDialog>[0]) => {
    if (confirm && !(await confirmDialog(confirm))) return;
    setBusy(action);
    try {
      const next: AdminUserDetail = await adminApi[action](user.id);
      setData(next);
      toast(done);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't do that. Check your connection.");
    } finally {
      setBusy(null);
    }
  };

  const totals = Object.fromEntries([...LOOKUP_KINDS, 'throttled'].map((k) => [k, usage.reduce((s, d) => s + d[k as UsageKind], 0)])) as Record<UsageKind, number>;
  const lookups30 = LOOKUP_KINDS.reduce((s, k) => s + totals[k], 0);

  return (
    <div className="admin-body">
      <section className={`card uhead${user.status === 'suspended' ? ' is-suspended' : ''}`} aria-labelledby="user-h">
        <Avatar name={user.name} admin={isAdmin} size={60} />
        <div className="uhead-who">
          <h2 id="user-h">
            {user.name}
            {isMe && <span className="you"> (you)</span>}
          </h2>
          <p>{user.email}</p>
          <UserPills user={user} />
        </div>
        <div className="uhead-actions">
          {(user.status === 'pending' || user.status === 'rejected') && <ApprovalButtons user={user} onDone={setData} size="md" />}
          {user.lockedUntil && (
            <button type="button" className="ghost sm" disabled={!!busy} onClick={() => void run('unlock', `Unlocked sign-in for ${user.name}`)}>
              <LockOpen className="ic" aria-hidden="true" /> Unlock sign-in
            </button>
          )}
          {(user.status === 'active' || user.status === 'suspended') && (
            <button
              type="button"
              className="ghost sm"
              disabled={!!busy || !sessions.length}
              title={sessions.length ? undefined : 'Not signed in anywhere'}
              onClick={() =>
                void run('signOutEverywhere', `Signed ${user.name} out everywhere`, {
                  title: isMe ? 'Sign yourself out everywhere?' : `Sign ${user.name} out everywhere?`,
                  body: isMe
                    ? 'You will be signed out on every device, including this one.'
                    : `This ends ${sessions.length === 1 ? 'their one session' : `all ${sessions.length} of their sessions`}. They can sign in again with their password.`,
                  confirmLabel: 'Sign out everywhere',
                })
              }
            >
              {busy === 'signOutEverywhere' ? <Spinner /> : <LogOut className="ic" aria-hidden="true" />} Sign out everywhere
            </button>
          )}
          {user.status === 'suspended' ? (
            <button type="button" className="primary sm" disabled={!!busy} onClick={() => void run('reactivate', `Reactivated ${user.name}`)}>
              {busy === 'reactivate' ? <Spinner /> : <UserCheck className="ic" aria-hidden="true" />} Reactivate
            </button>
          ) : (
            !isAdmin &&
            user.status === 'active' && (
              <button
                type="button"
                className="ghost sm danger-btn"
                disabled={!!busy}
                onClick={() =>
                  void run('suspend', `Suspended ${user.name}`, {
                    title: `Suspend ${user.name}?`,
                    body: 'They are signed out on every device at once, and can’t sign in or run checks until you reactivate the account. Their saved checks are kept.',
                    confirmLabel: 'Suspend account',
                    danger: true,
                  })
                }
              >
                {busy === 'suspend' ? <Spinner /> : <Ban className="ic" aria-hidden="true" />} Suspend
              </button>
            )
          )}
        </div>
      </section>

      {user.status === 'pending' && (
        <div className="oneline admin-alert" role="status">
          <Hourglass className="ic" aria-hidden="true" />
          <span>
            Signed up <Ago iso={user.createdAt} inline /> and waiting for your approval. They can sign in, but can’t check references until you approve
            them.
          </span>
        </div>
      )}
      {user.status === 'rejected' && (
        <div className="msg err admin-alert" role="status">
          <CircleX className="ic" aria-hidden="true" /> Sign-up declined {user.reviewedAt ? <Ago iso={user.reviewedAt} inline /> : ''}. They can’t sign in unless you
          approve them.
        </div>
      )}
      {user.status === 'suspended' && (
        <div className="msg err admin-alert" role="status">
          <Ban className="ic" aria-hidden="true" /> Suspended {user.suspendedAt ? <Ago iso={user.suspendedAt} inline /> : ''}. This account can’t sign in or run
          checks.
        </div>
      )}

      <section className="card" aria-labelledby="facts-h">
        <h2 className="card-h" id="facts-h">
          Account
        </h2>
        <dl className="facts">
          <div>
            <dt>Signed up</dt>
            <dd>
              {fmtDate(user.createdAt)}
              <small>
                <Ago iso={user.createdAt} />
              </small>
            </dd>
          </div>
          <div>
            <dt>Signed up from</dt>
            <dd>
              {user.signupIp ? <span className="mono">{user.signupIp}</span> : 'Unknown address'}
              <small title={user.signupUserAgent ?? undefined}>{user.signupDevice ?? 'Unknown browser'}</small>
            </dd>
          </div>
          <div>
            <dt>Last signed in</dt>
            <dd>
              <Ago iso={user.lastSignInAt} />
              <small>{user.lastSignInAt ? fmtDate(user.lastSignInAt) : '—'}</small>
            </dd>
          </div>
          <div>
            <dt>Last active</dt>
            <dd>
              <Ago iso={user.lastSeenAt} />
              <small>{sessions.length ? `${sessions.length} signed-in session${sessions.length === 1 ? '' : 's'}` : 'Not signed in anywhere'}</small>
            </dd>
          </div>
          <div>
            <dt>Saved checks</dt>
            <dd>
              {user.checks.toLocaleString()}
              <small>{data.lastCheckAt ? <>Last saved <Ago iso={data.lastCheckAt} inline /></> : 'None yet'}</small>
            </dd>
          </div>
          <div>
            <dt>Wrong passwords in a row</dt>
            <dd>
              {user.failedSignIns}
              <small>{user.lockedUntil ? `Locked until ${fmtDate(user.lockedUntil)}` : 'Locks for 15 minutes at 10'}</small>
            </dd>
          </div>
        </dl>
      </section>

      <section className="card" aria-labelledby="usage-h">
        <h2 className="card-h" id="usage-h">
          Usage, last 30 days
        </h2>
        <p className="help">
          {lookups30.toLocaleString()} lookups
          {totals.throttled ? `, and ${totals.throttled.toLocaleString()} requests refused by the rate limit` : ''}. Lookups are what checking costs: each
          one asks the scholarly databases.
        </p>
        <BarChart
          title={`Lookups by ${user.name} per day`}
          days={usage.map((d) => d.day)}
          series={[
            { key: 'lookups', label: 'Lookups', color: SERIES_COLORS.primary },
            { key: 'throttled', label: 'Rate-limited', color: SERIES_COLORS.secondary },
          ]}
          value={(i, key) => {
            const d = usage[i]!;
            return key === 'throttled' ? d.throttled : LOOKUP_KINDS.reduce((s, k) => s + d[k], 0);
          }}
          height={200}
        />
        <ul className="kinds">
          {(Object.keys(KIND_LABEL) as UsageKind[]).map((k) => (
            <li key={k} className={k === 'throttled' && totals[k] ? 'hot' : ''}>
              <b>{totals[k].toLocaleString()}</b>
              <span>{KIND_LABEL[k]}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="admin-grid">
        <section className="card" aria-labelledby="sessions-h">
          <h2 className="card-h" id="sessions-h">
            Signed in on
          </h2>
          {sessions.length ? (
            <ul className="sessions">
              {sessions.map((s) => (
                <li key={s.id}>
                  <span className="ev-ic plain" aria-hidden="true">
                    <MonitorSmartphone />
                  </span>
                  <div>
                    <b>{s.device ?? 'Unknown browser'}</b>
                    <small>
                      {s.ip ? <span className="mono">{s.ip}</span> : 'Unknown address'} · signed in <Ago iso={s.createdAt} /> · last active{' '}
                      <Ago iso={s.lastSeenAt} />
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="quiet">Not signed in on any device.</p>
          )}
        </section>

        <section className="card" aria-labelledby="uevents-h">
          <h2 className="card-h" id="uevents-h">
            Activity
          </h2>
          <EventList events={events} linkUsers={false} empty="No activity recorded for this account." />
        </section>
      </div>
    </div>
  );
}
