import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { PublicFrame } from '../components/PublicFrame';
import { AuthError, signup } from '../lib/auth';
import { useSession } from '../store/session';

export function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Request access · Siyasat';
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await signup(name, email, password);
      useSession.setState({ status: 'ready', user });
      navigate('/pending', { replace: true });
    } catch (e) {
      setError(e instanceof AuthError ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  return (
    <PublicFrame
      end={
        <Link className="btn public-ghost" to="/login">
          Log in
        </Link>
      }
    >
      <section className="card auth-card">
        <h1 className="page-h">Request access</h1>
        <p className="lead">Create an account. You can use the checker after the owner approves you.</p>
        <form onSubmit={(event) => void onSubmit(event)}>
          <div className="field">
            <label className="big" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              maxLength={80}
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="big" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
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
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <p className="help">At least 8 characters.</p>
          </div>
          {error && (
            <div className="msg err" role="alert">
              {error}
            </div>
          )}
          <div className="actions">
            <button className="primary lg" type="submit" disabled={busy}>
              {busy ? 'Sending request…' : 'Request access'}
            </button>
          </div>
        </form>
        <p className="help" style={{ marginTop: 18 }}>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </section>
    </PublicFrame>
  );
}
