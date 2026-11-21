import { Hourglass } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { Boot, Gate } from '../components/Gate';
import { logout } from '../lib/auth';
import { useSession } from '../session';

export function Pending() {
  const { ready, user, refresh } = useSession();
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    document.title = 'Waiting for approval · Siyasat';
  }, []);

  if (!ready) return <Boot />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.status === 'approved') return <Navigate to="/dashboard" replace />;

  const again = async () => {
    setChecking(true);
    const next = await refresh();
    setChecking(false);
    if (next?.status === 'approved') return;
  };

  return (
    <Gate>
      <main className="auth-wrap" id="main" tabIndex={-1}>
        <section className="card pending-card">
          <span className="fi" aria-hidden="true">
            <Hourglass />
          </span>
          <h1 className="page-h">Waiting for approval</h1>
          <p className="lead">
            {user.status === 'rejected'
              ? `${user.name}, your request hasn't been approved yet. You are still waiting for approval. The owner can approve it later.`
              : `${user.name}, your account is waiting for approval. You can log in, but the citation checker stays closed until the owner approves you.`}
          </p>
          <p className="help">Signed in as {user.email}</p>
          <div className="actions">
            <button className="primary" type="button" onClick={() => void again()} disabled={checking}>
              {checking ? 'Checking…' : 'Check again'}
            </button>
            <button className="ghost" type="button" onClick={() => void logout()}>
              Log out
            </button>
          </div>
        </section>
      </main>
    </Gate>
  );
}
