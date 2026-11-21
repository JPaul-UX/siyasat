import type { Account, AccountStatus } from '@siyasat/core';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AuthError, listAccounts, setAccountStatus } from '../lib/auth';
import { fmtDate } from '../lib/labels';
import { useSession } from '../session';

const FILTERS: { id: 'pending' | 'approved' | 'rejected' | 'all'; label: string }[] = [
  { id: 'pending', label: 'Waiting' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Not approved' },
  { id: 'all', label: 'Everyone' },
];

const STATUS_LABEL: Record<AccountStatus, string> = {
  pending: 'Waiting',
  approved: 'Approved',
  rejected: 'Not approved',
};

export function AdminPage() {
  const { user } = useSession();
  const [people, setPeople] = useState<Account[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setError('');
    try {
      setPeople(await listAccounts());
    } catch (e) {
      setPeople([]);
      setError(e instanceof AuthError ? e.message : 'Could not load accounts.');
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') void load();
  }, [user?.role]);

  if (user?.role !== 'admin') {
    return (
      <section className="card">
        <h1 className="page-h">Owner only</h1>
        <p className="lead">This page is for the person who approves new accounts.</p>
        <Link className="btn primary" to="/dashboard">
          Back to the dashboard
        </Link>
      </section>
    );
  }

  const act = async (id: string, action: 'approve' | 'reject' | 'revoke') => {
    setBusyId(id);
    setError('');
    try {
      const updated = await setAccountStatus(id, action);
      setPeople((list) => (list ?? []).map((p) => (p.id === id ? updated : p)));
    } catch (e) {
      setError(e instanceof AuthError ? e.message : 'That change did not save.');
    } finally {
      setBusyId(null);
    }
  };

  const shown = (people ?? []).filter((p) => filter === 'all' || p.status === filter);
  const count = (status: AccountStatus) => (people ?? []).filter((p) => p.status === status).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-h">Access requests</h1>
          <p className="lead">Approve someone and they can use the checker. Reject a request, or revoke access later.</p>
        </div>
      </div>
      <div className="seg" role="tablist" aria-label="Filter accounts">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
            {f.id !== 'all' && people ? ` (${count(f.id)})` : ''}
          </button>
        ))}
      </div>
      <section className="card" style={{ marginTop: 14 }}>
        {error && (
          <p className="msg err" role="alert">
            {error}
          </p>
        )}
        {people === null ? (
          <p className="help">Loading accounts…</p>
        ) : shown.length === 0 ? (
          <p className="help">{filter === 'pending' ? 'Nobody is waiting for approval.' : 'No accounts in this list.'}</p>
        ) : (
          <ul className="people">
            {shown.map((p) => (
              <li className="person" key={p.id}>
                <div className="who">
                  <b>{p.name}</b>
                  <small>{p.email}</small>
                  <small>
                    <span className={`pill ${p.status === 'approved' ? 'ok' : p.status === 'rejected' ? 'bad' : 'wait'}`}>{STATUS_LABEL[p.status]}</span>
                    {p.role === 'admin' ? ' · Owner' : ''} · {fmtDate(p.createdAt)}
                  </small>
                  {p.note && <p className="help">{p.note}</p>}
                </div>
                {p.id !== user.id && p.role !== 'admin' && (
                  <div className="actions">
                    {p.status !== 'approved' && (
                      <button className="primary sm" type="button" disabled={busyId === p.id} onClick={() => void act(p.id, 'approve')}>
                        Approve
                      </button>
                    )}
                    {p.status === 'pending' && (
                      <button className="ghost sm" type="button" disabled={busyId === p.id} onClick={() => void act(p.id, 'reject')}>
                        Reject
                      </button>
                    )}
                    {p.status === 'approved' && (
                      <button className="ghost sm" type="button" disabled={busyId === p.id} onClick={() => void act(p.id, 'revoke')}>
                        Revoke
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
