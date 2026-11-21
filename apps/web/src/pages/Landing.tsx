import { Check, ScanSearch, ShieldCheck, TextSearch, TriangleAlert, WandSparkles } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { Boot, Gate } from '../components/Gate';
import { useSession } from '../session';

export function Landing() {
  const { ready, offline } = useSession();
  useEffect(() => {
    document.title = 'Siyasat · Citation checker';
  }, []);
  if (!ready) return <Boot />;

  return (
    <Gate>
      <main className="gate-main" id="main" tabIndex={-1}>
        <section className="hero">
          <div className="eyebrow">
            <ShieldCheck className="ic" aria-hidden="true" /> Siyasat · Citation checker
          </div>
          <h1>
            Is every source in your paper <em>real</em>?
          </h1>
          <p>
            AI tools sometimes invent references or get the details wrong. Siyasat checks each one against Crossref and OpenAlex, flags
            retracted papers, and hands you a corrected bibliography.
          </p>
          <ul className="hero-points">
            <li>
              <Check className="ic" aria-hidden="true" /> Checked against Crossref and OpenAlex
            </li>
            <li>
              <Check className="ic" aria-hidden="true" /> Retracted papers are marked
            </li>
            <li>
              <Check className="ic" aria-hidden="true" /> Corrected lists in common citation styles
            </li>
          </ul>
          <div className="hero-actions">
            <Link className="btn gold lg" to="/signup">
              Request access
            </Link>
            <Link className="btn ghost lg" to="/login">
              Log in
            </Link>
          </div>
        </section>

        {offline && (
          <p className="msg err" role="alert">
            Siyasat can't be reached right now. Check your connection and refresh the page.
          </p>
        )}

        <h2 className="gate-h">What Siyasat does</h2>
        <div className="features">
          <div className="feature">
            <span className="fi" aria-hidden="true">
              <ScanSearch />
            </span>
            <b>Catches made-up sources</b>
            <p>A reference no database has heard of is the classic sign of an AI hallucination.</p>
          </div>
          <div className="feature">
            <span className="fi" aria-hidden="true">
              <WandSparkles />
            </span>
            <b>Fixes the details</b>
            <p>Wrong year, author, volume or DOI? See the official record next to what you wrote.</p>
          </div>
          <div className="feature">
            <span className="fi" aria-hidden="true">
              <TriangleAlert />
            </span>
            <b>Flags retractions</b>
            <p>Papers their journal has withdrawn are marked, so they don't end up as evidence.</p>
          </div>
          <div className="feature">
            <span className="fi" aria-hidden="true">
              <TextSearch />
            </span>
            <b>Checks claims too</b>
            <p>Put each cited sentence next to its source's abstract and judge whether it holds up.</p>
          </div>
        </div>

        <section className="card">
          <h2 className="card-h">How it works</h2>
          <p className="help">Three steps. You stay in charge of the final wording.</p>
          <ol className="how">
            <li>
              <b>Add your sources</b>
              Paste a reference list, or upload a paper as a PDF or Word file.
            </li>
            <li>
              <b>Siyasat checks each one</b>
              Every reference is looked up in Crossref and OpenAlex, then checked for a retraction.
            </li>
            <li>
              <b>Fix and copy</b>
              See what doesn't match, then copy a corrected bibliography or download a report.
            </li>
          </ol>
        </section>

        <section className="card access-note">
          <h2 className="card-h">Request access</h2>
          <p className="help">
            Signing up creates an account that is waiting for approval. You can log in, but the checker stays closed until the owner
            approves you. If a request is turned down, logging in still shows that you are waiting for approval.
          </p>
          <div className="actions">
            <Link className="btn primary lg" to="/signup">
              Request access
            </Link>
            <Link className="btn ghost lg" to="/login">
              I already have an account
            </Link>
          </div>
        </section>
      </main>
    </Gate>
  );
}
