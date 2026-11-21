import { Clock } from 'lucide-react';
import { useEffect } from 'react';
import { Navigate } from 'react-router';
import { PublicFrame } from '../components/PublicFrame';
import { loadSession, logout, useSession } from '../store/session';

/** Shown to anyone who is logged in but not approved. The checker stays closed. */
export function Pending() {
  const user = useSession((s) => s.user);

  useEffect(() => {
    document.title = 'Waiting for approval · Siyasat';
    const timer = window.setInterval(() => void loadSession(), 4000);
    return () => window.clearInterval(timer);
  }, []);

  if (!user) return <Navigate to="/login" replace />;
  if (user.status === 'APPROVED') return <Navigate to="/" replace />;

  const rejected = user.status === 'REJECTED';

  return (
    <PublicFrame
      end={
        <button type="button" className="btn public-ghost" onClick={() => void logout()}>
          Log out
        </button>
      }
    >
      <section className="card auth-card">
        <div className="eyebrow">
          <Clock className="ic" aria-hidden="true" /> Account
        </div>
        <h1 className="page-h">Waiting for approval</h1>
        {rejected ? (
          <p className="lead">
            Your request was not approved, so the checker stays closed. Contact the person who runs Siyasat if you think this is a mistake.
          </p>
        ) : (
          <p className="lead">
            Thanks, {user.name}. Your account is pending. You can use the checker once an admin approves it. This page updates on its own.
          </p>
        )}
        <p className="help">Signed in as {user.email}</p>
      </section>
    </PublicFrame>
  );
}
