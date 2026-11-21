import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { Boot, Gate } from '../components/Gate';
import { AuthError, login, safeNext } from '../lib/auth';
import { useSession } from '../session';

export function Login() {
  const { ready, user, setUser } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    document.title = 'Log in · Siyasat';
  }, []);

  if (!ready) return <Boot />;
  if (user?.status === 'approved') return <Navigate to={safeNext(params.get('next'))} replace />;
  if (user) return <Navigate to="/pending" replace />;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError('');
    setBusy(true);
    try {
      const account = await login(String(data.get('email') ?? ''), String(data.get('password') ?? ''));
      setUser(account);
      navigate(account.status === 'approved' ? safeNext(params.get('next')) : '/pending', { replace: true });
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Could not log in. Try again.');
      setBusy(false);
    }
  };

  return (
    <Gate>
      <main className="auth-wrap" id="main" tabIndex={-1}>
        <section className="card">
          <h1 className="page-h">Log in</h1>
          <p className="lead">Use the email and password from your access request.</p>
          <form onSubmit={(e) => void submit(e)}>
            <div className="field">
              <label className="big" htmlFor="email">
                Email
              </label>
              <input id="email" name="email" type="email" autoComplete="username" required autoFocus />
            </div>
            <div className="field">
              <label className="big" htmlFor="password">
                Password
              </label>
              <input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            {error && (
              <p className="msg err" role="alert">
                {error}
              </p>
            )}
            <div className="actions">
              <button className="primary lg" type="submit" disabled={busy}>
                {busy ? 'Checking…' : 'Log in'}
              </button>
            </div>
          </form>
          <p className="help" style={{ marginTop: 16 }}>
            No account yet? <Link to="/signup">Request access</Link>
          </p>
        </section>
      </main>
    </Gate>
  );
}
