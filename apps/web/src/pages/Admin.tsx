import type { AccountStatus, AdminUser } from '@siyasat/core';
import { useEffect, useState } from 'react';
import { PageHead, Spinner } from '../components/bits';
import { AuthError, listUsers, setUserStatus } from '../lib/auth';
import { fmtDate } from '../lib/labels';
import { confirmDialog } from '../store/dialog';
import { useSession } from '../store/session';

const GROUPS: { status: AccountStatus; title: string; empty: string }[] = [
  { status: 'PENDING', title: 'Waiting for approval', empty: 'No one is waiting.' },
  { status: 'APPROVED', title: 'Approved', empty: 'No one else is approved yet.' },
  { status: 'REJECTED', title: 'Not approved', empty: 'No one has been rejected.' },
];

export function Admin() {
  const me = useSession((s) => s.user);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setUsers(await listUsers());
      setError('');
    } catch (e) {
      setError(e instanceof AuthError ? e.message : 'Could not load accounts.');
    }
  };

  useEffect(() => {
    document.title = 'Access · Siyasat';
    void refresh();
  }, []);

  const act = async (user: AdminUser, action: 'approve' | 'reject' | 'revoke') => {
    const verb = action === 'approve' ? 'Approve' : action === 'revoke' ? 'Revoke' : 'Reject';
    const sure = await confirmDialog({
      title: `${verb} ${user.name}?`,
      body:
        action === 'approve'
          ? 'They will be able to log in and use the checker.'
          : action === 'revoke'
            ? 'They will lose access to the checker. They can still log in and will see that they are waiting.'
            : 'They will not be able to use the checker.',
      confirmLabel: verb,
      danger: action !== 'approve',
    });
    if (!sure) return;
    setBusyId(user.id);
    setError('');
    try {
      const updated = await setUserStatus(user.id, action);
      setUsers((list) => list?.map((row) => (row.id === updated.id ? updated : row)) ?? [updated]);
    } catch (e) {
      setError(e instanceof AuthError ? e.message : 'That change did not save.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHead title="Who can use Siyasat" lead="Approve a person to let them use the checker. Reject a request, or revoke someone you already approved." />
      {error && (
        <div className="msg err" role="alert">
          {error}
        </div>
      )}
      {users === null ? (
        <div className="boot" role="status">
          <Spinner />
          Loading accounts…
        </div>
      ) : (
        GROUPS.map((group) => {
          const rows = users.filter((user) => user.status === group.status);
          return (
            <section className="card" key={group.status}>
              <h2 className="card-h">
                {group.title} <span className="meta">({rows.length})</span>
              </h2>
              {rows.length === 0 ? (
                <p className="help">{group.empty}</p>
              ) : (
                <div className="people-wrap">
                  <table className="people">
                    <caption className="sr">{group.title}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Email</th>
                        <th scope="col">Requested</th>
                        <th scope="col">
                          <span className="sr">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((user) => {
                        const mine = user.id === me?.id;
                        const busy = busyId === user.id;
                        return (
                          <tr key={user.id}>
                            <td>
                              <b>{user.name}</b>
                              {user.role === 'ADMIN' && <span className="pill wait">Owner</span>}
                              {mine && <span className="meta"> You</span>}
                            </td>
                            <td>{user.email}</td>
                            <td>{fmtDate(user.createdAt)}</td>
                            <td>
                              {mine || user.role === 'ADMIN' ? (
                                <span className="meta">—</span>
                              ) : (
                                <div className="row-actions">
                                  {user.status !== 'APPROVED' && (
                                    <button type="button" className="primary sm" disabled={busy} onClick={() => void act(user, 'approve')}>
                                      Approve<span className="sr"> {user.name}</span>
                                    </button>
                                  )}
                                  {user.status === 'PENDING' && (
                                    <button type="button" className="danger-btn" disabled={busy} onClick={() => void act(user, 'reject')}>
                                      Reject<span className="sr"> {user.name}</span>
                                    </button>
                                  )}
                                  {user.status === 'APPROVED' && (
                                    <button type="button" className="danger-btn" disabled={busy} onClick={() => void act(user, 'revoke')}>
                                      Revoke<span className="sr"> {user.name}</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })
      )}
    </>
  );
}
