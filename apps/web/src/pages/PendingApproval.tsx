import { CircleCheck, Hourglass, LogOut, RefreshCw, ScanSearch } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Logo, Spinner } from '../components/bits';
import { refreshMe, signOut, useAuth } from '../store/auth';
import { AuthArt } from './AuthPage';

/** How often the page asks whether the account has been approved. */
const CHECK_EVERY_MS = 15_000;

/**
 * What someone sees after signing up, until the super admin approves the account. It checks back on its own
 * and lets them in the moment they are approved; they can also close it and simply sign in later.
 */
export function PendingApproval() {
  const user = useAuth((s) => s.user);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    document.title = 'Waiting for approval · Siyasat';
    const check = () => {
      if (document.visibilityState === 'visible') void refreshMe();
    };
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  if (!user) return null;
  const first = user.name.split(/\s+/)[0];

  const checkNow = async () => {
    setChecking(true);
    await refreshMe();
    setChecking(false);
  };

  return (
    <div className="auth">
      <AuthArt />
      <main className="auth-main" id="main">
        <div className="auth-card">
          <div className="auth-brand">
            <Logo tone="maroon" size={38} />
            <span>
              <b>Siyasat</b>
              <small>Citation checker</small>
            </span>
          </div>
          <span className="wait-ic" aria-hidden="true">
            <Hourglass />
          </span>
          <h1 className="auth-h">You’re on the list, {first}</h1>
          <p className="auth-lead">
            An administrator approves every new account before it can check references. This page lets you in by itself as soon as yours is approved,
            or you can close it and sign in later.
          </p>

          <ol className="wait-steps">
            <li className="done">
              <span className="step-ic" aria-hidden="true">
                <CircleCheck />
              </span>
              <div>
                <b>Account created</b>
                <small>{user.email}</small>
              </div>
            </li>
            <li className="now" aria-current="step">
              <span className="step-ic" aria-hidden="true">
                <span className="pulse" />
              </span>
              <div>
                <b>Waiting for approval</b>
                <small role="status">{checking ? 'Checking now…' : 'Checking every few seconds while this page is open'}</small>
              </div>
            </li>
            <li>
              <span className="step-ic" aria-hidden="true">
                <ScanSearch />
              </span>
              <div>
                <b>Check your references</b>
                <small>Paste a list or upload a paper</small>
              </div>
            </li>
          </ol>

          <div className="wait-actions">
            <button type="button" className="primary" onClick={() => void checkNow()} disabled={checking}>
              {checking ? <Spinner /> : <RefreshCw className="ic" aria-hidden="true" />} Check again
            </button>
            <button type="button" className="ghost" onClick={() => void signOut()}>
              <LogOut className="ic" aria-hidden="true" /> Sign out
            </button>
          </div>
          <p className="auth-fine">Signed up with the wrong address? Sign out and create the account again with the right one.</p>
        </div>
      </main>
    </div>
  );
}
