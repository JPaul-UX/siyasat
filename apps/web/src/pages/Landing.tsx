import { Check, ScanSearch, ShieldCheck, TextSearch, TriangleAlert, WandSparkles } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { PublicFrame } from '../components/PublicFrame';

export function Landing() {
  useEffect(() => {
    document.title = 'Siyasat · Citation checker';
  }, []);

  return (
    <PublicFrame
      end={
        <>
          <Link className="btn public-ghost" to="/login">
            Log in
          </Link>
          <Link className="btn gold" to="/signup">
            Request access
          </Link>
        </>
      }
    >
      <section className="hero">
        <div className="eyebrow">
          <ShieldCheck className="ic" aria-hidden="true" /> Citation checker
        </div>
        <h1>
          Is every source in your paper <em>real</em>?
        </h1>
        <p>
          AI tools sometimes invent references or get the details wrong. Siyasat looks each one up in scholarly databases, flags retracted
          papers, and hands you a corrected list in APA, MLA, Chicago, Harvard, IEEE or Vancouver style.
        </p>
        <ul className="hero-points">
          <li>
            <Check className="ic" aria-hidden="true" /> Request access, then the owner approves you
          </li>
          <li>
            <Check className="ic" aria-hidden="true" /> Reads and writes any common citation style
          </li>
          <li>
            <Check className="ic" aria-hidden="true" /> Checked against Crossref and OpenAlex
          </li>
        </ul>
        <div className="hero-actions">
          <Link className="btn gold lg" to="/signup">
            Request access
          </Link>
          <Link className="btn hero-ghost lg" to="/login">
            Log in
          </Link>
        </div>
      </section>

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
          <p>Wrong year, author, volume or DOI? See the official record side by side with what you wrote.</p>
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
        <ol className="how">
          <li>
            <b>Add your sources</b>Paste your reference list, or upload your paper as a PDF or Word file.
          </li>
          <li>
            <b>Siyasat checks each one</b>Every reference is looked up, matched, and checked for retraction.
          </li>
          <li>
            <b>Fix and copy</b>See what's wrong, then copy the corrected bibliography or download a report.
          </li>
        </ol>
        <p className="help" style={{ marginTop: 16 }}>
          The checker opens after your account is approved. The full method is explained inside.
        </p>
      </section>
    </PublicFrame>
  );
}
