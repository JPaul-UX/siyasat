/* Pieces the admin pages share. */
import type { ActivityType, AdminEvent, AdminUserRow } from '@siyasat/core';
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  CircleX,
  DoorClosed,
  DoorOpen,
  KeyRound,
  LockKeyhole,
  LockOpen,
  LogIn,
  LogOut,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UserX,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { fmtDate } from '../../lib/labels';
import { paths } from '../../lib/nav';

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then the date. */
export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return 'Never';
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: days > 300 ? 'numeric' : undefined });
}

/** A time that says "3 h ago" and shows the exact date and time on hover. */
export function Ago({ iso }: { iso: string | null }) {
  if (!iso) return <span className="quiet">Never</span>;
  return (
    <time dateTime={iso} title={fmtDate(iso)}>
      {timeAgo(iso)}
    </time>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

export function Avatar({ name, admin, size = 36 }: { name: string; admin?: boolean; size?: number }) {
  return (
    <span className={`avatar${admin ? ' admin' : ''}`} style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** Active / suspended, plus "Super admin" and "Locked" when they apply. */
export function UserPills({ user }: { user: Pick<AdminUserRow, 'status' | 'role' | 'lockedUntil'> }) {
  return (
    <span className="upills">
      {user.status === 'suspended' ? (
        <span className="pill bad">
          <Ban aria-hidden="true" /> Suspended
        </span>
      ) : (
        <span className="pill ok">Active</span>
      )}
      {user.role === 'super_admin' && (
        <span className="pill admin">
          <ShieldCheck aria-hidden="true" /> Super admin
        </span>
      )}
      {user.lockedUntil && (
        <span className="pill wait" title={`Sign-in paused until ${fmtDate(user.lockedUntil)}`}>
          <LockKeyhole aria-hidden="true" /> Locked
        </span>
      )}
    </span>
  );
}

export function Pager({ page, pageSize, total, onPage, noun }: { page: number; pageSize: number; total: number; onPage: (page: number) => void; noun: string }) {
  if (total <= pageSize && page === 1) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="pager apager" aria-label={`Pages of ${noun}`}>
      <span className="meta">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} {noun}
      </span>
      <button type="button" className="ghost sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="ic" aria-hidden="true" /> Previous
      </button>
      <button type="button" className="ghost sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next <ChevronRight className="ic" aria-hidden="true" />
      </button>
    </nav>
  );
}

/* ---------- Activity ---------- */

type Tone = 'ok' | 'bad' | 'warn' | 'plain';

const ICON: Record<ActivityType, [LucideIcon, Tone]> = {
  sign_up: [UserPlus, 'ok'],
  sign_up_blocked: [CircleX, 'bad'],
  sign_in: [LogIn, 'plain'],
  sign_in_failed: [KeyRound, 'bad'],
  sign_out: [LogOut, 'plain'],
  locked: [LockKeyhole, 'bad'],
  suspended: [UserX, 'warn'],
  reactivated: [UserCheck, 'warn'],
  unlocked: [LockOpen, 'warn'],
  signed_out_everywhere: [LogOut, 'warn'],
  signups_paused: [DoorClosed, 'warn'],
  signups_opened: [DoorOpen, 'warn'],
};

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One sentence saying what happened. */
function sentence(e: AdminEvent, linkUser: boolean): ReactNode {
  const label = e.userName ?? e.email ?? 'Someone';
  const who =
    e.userId && linkUser ? (
      <Link to={paths.adminUser(e.userId)}>
        <b>{label}</b>
      </Link>
    ) : (
      <b>{label}</b>
    );
  const actor = <b>{e.actorEmail ?? 'An admin'}</b>;
  const d = e.detail ?? {};
  switch (e.type) {
    case 'sign_up':
      return (
        <>
          {who} created an account{num(d['claimedChecks']) ? `, bringing ${plural(num(d['claimedChecks']), 'saved check')}` : ''}
        </>
      );
    case 'sign_up_blocked':
      return d['reason'] === 'paused' ? (
        <>
          Turned away a sign-up as <b>{e.email}</b> while sign-ups were paused
        </>
      ) : (
        <>
          Blocked a sign-up by a bot as <b>{e.email}</b>
        </>
      );
    case 'sign_in':
      return (
        <>
          {who} signed in{num(d['claimedChecks']) ? `, bringing ${plural(num(d['claimedChecks']), 'saved check')}` : ''}
        </>
      );
    case 'sign_in_failed':
      if (d['reason'] === 'no_account')
        return (
          <>
            Failed sign-in as <b>{e.email}</b>: no such account
          </>
        );
      if (d['reason'] === 'locked') return <>{who} tried to sign in while locked</>;
      if (d['reason'] === 'suspended') return <>{who} tried to sign in while suspended</>;
      return (
        <>
          {who} typed a wrong password{num(d['attempt']) > 1 ? ` (${num(d['attempt'])} in a row)` : ''}
        </>
      );
    case 'sign_out':
      return <>{who} signed out</>;
    case 'locked':
      return <>{who} was locked out for {num(d['minutes']) || 15} minutes after too many wrong passwords</>;
    case 'suspended':
      return (
        <>
          {actor} suspended {who}
        </>
      );
    case 'reactivated':
      return (
        <>
          {actor} reactivated {who}
        </>
      );
    case 'unlocked':
      return (
        <>
          {actor} unlocked sign-in for {who}
        </>
      );
    case 'signed_out_everywhere':
      return (
        <>
          {actor} signed {who} out everywhere{d['sessionsEnded'] !== undefined ? ` (${plural(num(d['sessionsEnded']), 'session')})` : ''}
        </>
      );
    case 'signups_paused':
      return <>{actor} paused new sign-ups</>;
    case 'signups_opened':
      return <>{actor} opened sign-ups</>;
  }
}

export function EventList({ events, linkUsers = true, empty = 'Nothing has happened yet.' }: { events: AdminEvent[]; linkUsers?: boolean; empty?: string }) {
  if (!events.length) return <p className="quiet events-empty">{empty}</p>;
  return (
    <ul className="events">
      {events.map((e) => {
        const [Icon, tone] = ICON[e.type] ?? [KeyRound, 'plain'];
        return (
          <li key={e.id}>
            <span className={`ev-ic ${tone}`} aria-hidden="true">
              <Icon />
            </span>
            <div className="ev-body">
              <p>{sentence(e, linkUsers)}</p>
              <small>
                <Ago iso={e.createdAt} />
                {e.ip && (
                  <>
                    {' · '}
                    <span className="mono">{e.ip}</span>
                  </>
                )}
                {e.device && <> · {e.device}</>}
              </small>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
