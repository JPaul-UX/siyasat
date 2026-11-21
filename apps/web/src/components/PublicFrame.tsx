import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from './Logo';

/** The pages someone sees before they can use the checker: a maroon bar and the page. */
export function PublicFrame({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="public-bar">
        <Link className="brand" to="/">
          <Logo size={36} />
          <div>
            <b>Siyasat</b>
            <small>Citation checker</small>
          </div>
        </Link>
        <nav className="public-nav" aria-label="Account">
          {end}
        </nav>
      </header>
      <main id="main" className="public-main" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
