import type { CheckSummary } from '@siyasat/core';
import { useEffect, useRef } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router';
import { Spinner } from './components/bits';
import { Toast } from './components/Toast';
import { backTarget, paths, setNavigate, trackVisit, typeName } from './lib/nav';
import { Dashboard } from './pages/Dashboard';
import { NewCheck } from './pages/NewCheck';
import { Reader } from './pages/Reader';
import { Reports } from './pages/Reports';
import { Results } from './pages/Results';
import { UploadPage } from './pages/UploadPage';
import { initChecks, useChecks } from './store/checks';
import { stopEditing, useForms } from './store/forms';

const ICONS = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  new: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  ),
  results: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 11l3 3 8-8" />
      <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" />
    </svg>
  ),
  reports: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </svg>
  ),
};

const TITLES: Record<string, string> = { new: 'New check', results: 'Results', reports: 'Reports', read: 'Full-text reader', upload: 'Upload & check' };

type Crumb = [name: string, to: string | null];

function crumbs(page: string, parts: string[], summaries: CheckSummary[]): Crumb[] {
  const trail: Crumb[] = [['Dashboard', paths.dashboard]];
  if (page === 'new') {
    const type = parts[0] as CheckSummary['type'] | undefined;
    if (type && typeName(type)) trail.push(['New check', paths.newCheck()], ['Step 2 · ' + typeName(type), null]);
    else trail.push(['New check', null]);
  } else if (page === 'results') {
    const [id, sub] = parts;
    const c = id ? summaries.find((x) => x.id === id) : summaries[0];
    trail.push(['Results', c ? paths.results() : null]);
    if (c) {
      const name = c.combo ? 'Upload & check results' : null;
      if (sub === 'refs') trail.push([name ?? 'Check', paths.results(c.id)], ['Reference results', null]);
      else trail.push([name ?? typeName(c.type) ?? 'Check', null]);
    }
  } else if (page === 'reports') trail.push(['Reports', null]);
  else if (page === 'upload') trail.push(['Upload & check', null]);
  else if (page === 'read') trail.push(['Results', paths.results()], ['Full-text reader', null]);
  return trail;
}

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const status = useChecks((s) => s.status);
  const summaries = useChecks((s) => s.summaries);
  const [page = 'dashboard', ...parts] = location.pathname.split('/').filter(Boolean);
  const here = location.pathname + location.search;

  // Recorded while rendering so the Back button below already knows where "back" is.
  trackVisit(here);
  const back = backTarget(here);
  const goBack = () => (back.viaHistory ? navigate(-1) : navigate(back.to));

  useEffect(() => setNavigate(navigate), [navigate]);
  useEffect(() => void initChecks(), []);

  const firstRender = useRef(true);
  useEffect(() => {
    document.title = `${TITLES[page] ?? 'Dashboard'} · Siyasat`;
    window.scrollTo(0, 0);
    // Leaving the form abandons an edit in progress, unless its check is still running.
    const forms = useForms.getState();
    if (page !== 'new' && forms.editing && !forms.draftRunning) stopEditing();
    // After moving to another page, put keyboard and screen-reader focus on its heading.
    if (!firstRender.current) {
      const h1 = document.querySelector<HTMLElement>('#main h1');
      if (h1) {
        h1.tabIndex = -1;
        h1.focus({ preventScroll: true });
      }
    }
    firstRender.current = false;
  }, [location.pathname, page]);

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="mhead">
        <button type="button" className="back mback" hidden={page === 'dashboard'} onClick={goBack}>
          ← Back to {back.label}
        </button>
        <div className="mark" aria-hidden="true">
          S
        </div>
        <b>Siyasat</b>
      </div>
      <div className="app">
        <nav className="side" aria-label="Main">
          <div className="brand">
            <div className="mark" aria-hidden="true">
              S
            </div>
            <div>
              <b>Siyasat</b>
              <small>Catch AI hallucinations</small>
            </div>
          </div>
          <div className="nav">
            <NavLink to={paths.dashboard} end>
              {ICONS.dashboard}Dashboard
            </NavLink>
            <NavLink to={paths.newCheck()}>{ICONS.new}New check</NavLink>
            <NavLink to={paths.results()}>{ICONS.results}Results</NavLink>
            <NavLink to={paths.reports}>{ICONS.reports}Reports</NavLink>
          </div>
          <div className="foot">Your counter against AI hallucinations. Catch them before you submit.</div>
        </nav>
        <main id="main" tabIndex={-1}>
          {page !== 'dashboard' && (
            <div className="backbar">
              <button type="button" className="back" onClick={goBack}>
                ← Back to {back.label}
              </button>
              <nav className="crumbs" aria-label="Breadcrumb">
                <ol>
                  {crumbs(page, parts, summaries).map(([name, to]) => (
                    <li key={name}>{to ? <Link to={to}>{name}</Link> : <span aria-current="page">{name}</span>}</li>
                  ))}
                </ol>
              </nav>
            </div>
          )}
          {status === 'loading' ? (
            <div className="boot" role="status">
              <Spinner />
              Loading your checks…
            </div>
          ) : status === 'error' ? (
            <section className="card">
              <h1 className="page-h">Siyasat can't be reached</h1>
              <p className="lead">We couldn't load your saved checks. Check your internet connection and try again.</p>
              <button type="button" className="primary" onClick={() => void initChecks()}>
                Try again
              </button>
            </section>
          ) : (
            <Routes>
              <Route path="/new/:type?" element={<NewCheck />} />
              <Route path="/results/:id?/:view?" element={<Results />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/read" element={<Reader />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
          )}
        </main>
      </div>
      <Toast />
    </>
  );
}
