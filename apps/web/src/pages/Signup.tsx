import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { Boot, Gate } from '../components/Gate';
import { AuthError, signup } from '../lib/auth';
import { useSession } from '../session';

export function Signup() {
  const { ready, user, setUser } = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    document.title = 'Request access · Siyasat';
  }, []);

  if (!ready) return <Boot />;
  if (user?.status === 'approved') return <Navigate to="/dashboard" replace />;
  if (user) return <Navigate to="/pending" replace />;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const password = String(data.get('password') ?? '');
    const again = String(data.get('again') ?? '');
    if (password !== again) {
      setError('Those passwords do not match.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const account = await signup({
        name: String(data.get('name') ?? ''),
        email: String(data.get('email') ?? ''),
        password,
        note: String(data.get('note') ?? ''),
      });
      setUser(account);
      navigate('/pending', { replace: true });
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Could not create the account. Try again.');
      setBusy(false);
    }
  };

  return (
    <Gate>
      <main className="auth-wrap" id="main" tabIndex={-1}>
        <section className="card">
          <h1 className="page-h">Request access</h1>
          <p className="lead">This creates an account that stays closed until the owner approves it.</p>
          <form onSubmit={(e) => void submit(e)}>
            <div className="field">
              <label className="big" htmlFor="name">
                Your name
              </label>
              <input id="name" name="name" type="text" autoComplete="name" required maxLength={80} autoFocus />
            </div>
            <div className="field">
              <label className="big" htmlFor="email">
                Email
              </label>
              <input id="email" name="email" type="email" autoComplete="username" required />
            </div>
            <div className="field">
              <label className="big" htmlFor="password">
                Password
              </label>
              <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
              <p className="help">At least 8 characters.</p>
            </div>
            <div className="field">
              <label className="big" htmlFor="again">
                Password again
              </label>
              <input id="again" name="again" type="password" autoComplete="new-password" required minLength={8} />
            </div>
            <div className="field">
              <label className="big" htmlFor="note">
                What will you use it for? <span className="meta">(optional)</span>
              </label>
              <textarea id="note" name="note" maxLength={500} placeholder="For example: checking the references in my thesis." style={{ minHeight: 90, fontFamily: 'inherit', fontSize: 15 }} />
            </div>
            {error && (
              <p className="msg err" role="alert">
                {error}
              </p>
            )}
            <div className="actions">
              <button className="primary lg" type="submit" disabled={busy}>
                {busy ? 'Sending…' : 'Request access'}
              </button>
            </div>
          </form>
          <p className="help" style={{ marginTop: 16 }}>
            Already requested? <Link to="/login">Log in</Link> to see if you've been approved.
          </p>
        </section>
      </main>
    </Gate>
  );
}
