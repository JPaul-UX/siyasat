import { Link } from 'react-router';
import { Logo } from './Logo';
import { Spinner } from './bits';
import { useSession } from '../session';

/** The public pages: landing, sign-in, and the waiting screen. No checker navigation. */
export function Gate({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  return (
    <div className="gate">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="gate-bar">
        <Link className="gate-brand" to="/">
          <Logo tone="maroon" size={40} />
          <span>
            <b>Siyasat</b>
            <small>Citation checker</small>
          </span>
        </Link>
        <nav className="gate-nav" aria-label="Account">
          {user?.status === 'approved' ? (
            <Link className="btn primary" to="/dashboard">
              Open the checker
            </Link>
          ) : user ? (
            <Link className="btn primary" to="/pending">
              Waiting for approval
            </Link>
          ) : (
            <>
              <Link className="btn ghost" to="/login">
                Log in
              </Link>
              <Link className="btn primary" to="/signup">
                Request access
              </Link>
            </>
          )}
        </nav>
      </header>
      {children}
      <footer className="gate-foot">Siyasat · Citation checker</footer>
    </div>
  );
}

export function Boot({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="gate-boot" role="status">
      <Spinner />
      {label}
    </div>
  );
}
