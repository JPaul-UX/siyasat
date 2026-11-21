import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { PublicFrame } from '../components/PublicFrame';
import { AuthError, login, safeNext } from '../lib/auth';
import { useSession } from '../store/session';

export function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Log in · Siyasat';
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(email, password);
      useSession.setState({ status: 'ready', user });
      if (user.status === 'APPROVED') navigate(safeNext(`?${params.toString()}`) ?? '/', { replace: true });
      else navigate('/pending', { replace: true });
    } catch (e) {
      setError(e instanceof AuthError ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  return (
    <PublicFrame
      end={
        <Link className="btn gold" to="/signup">
          Request access
        </Link>
      }
    >
      <section className="card auth-card">
        <h1 className="page-h">Log in</h1>
        <p className="lead">Use the email and password for your Siyasat account.</p>
        <form onSubmit={(event) => void onSubmit(event)}>
          <div className="field">
            <label className="big" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="big" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error && (
            <div className="msg err" role="alert">
              {error}
            </div>
          )}
          <div className="actions">
            <button className="primary lg" type="submit" disabled={busy}>
              {busy ? 'Logging in…' : 'Log in'}
            </button>
          </div>
        </form>
        <p className="help" style={{ marginTop: 18 }}>
          No account yet? <Link to="/signup">Request access</Link>
        </p>
      </section>
    </PublicFrame>
  );
}
