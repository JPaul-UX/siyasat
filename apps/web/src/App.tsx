import type { CheckSummary } from '@siyasat/core';
import { ArrowLeft, ChevronRight, FileText, LayoutDashboard, ListChecks, Plus, WifiOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router';
import { Empty, Logo, Spinner } from './components/bits';
import { Dialog } from './components/Dialog';
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

const TITLES: Record<string, string> = { new: 'New check', results: 'Results', reports: 'Reports', read: 'Full-text reader', upload: 'Upload & check' };

type Crumb = [name: string, to: string | null];

function crumbs(page: string, parts: string[], summaries: CheckSummary[]): Crumb[] {
  const trail: Crumb[] = [['Dashboard', paths.dashboard]];
  if (page === 'new') {
    const type = parts[0] as CheckSummary['type'] | undefined;
    if (type && typeName(type)) trail.push(['New check', paths.newCheck()], [typeName(type), null]);
    else trail.push(['New check', null]);
  } else if (page === 'results') {
    const [id, sub] = parts;
    const c = id ? summaries.find((x) => x.id === id) : summaries[0];
    trail.push(['Results', c ? paths.results() : null]);
    if (c) {
      if (sub === 'refs') trail.push([c.name, paths.results(c.id)], ['Reference list', null]);
      else trail.push([c.name, null]);
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

      {/* Small screens: a top bar and a tab bar replace the sidebar. */}
      <header className="topbar">
        {page !== 'dashboard' && (
          <button type="button" className="icon-btn" onClick={goBack} aria-label={`Back to ${back.label}`}>
            <ArrowLeft className="ic" aria-hidden="true" />
          </button>
        )}
        <Link className="brand" to={paths.dashboard}>
          <Logo size={32} />
          <b>Siyasat</b>
        </Link>
      </header>

      <div className="app">
        <aside className="side">
          <Link className="brand" to={paths.dashboard}>
            <Logo />
            <div>
              <b>Siyasat</b>
              <small>Citation checker</small>
            </div>
          </Link>
          <Link className="side-cta" to={paths.newCheck()}>
            <Plus className="ic" aria-hidden="true" /> New check
          </Link>
          <nav className="nav" aria-label="Main">
            <NavLink to={paths.dashboard} end>
              <LayoutDashboard aria-hidden="true" />
              Dashboard
            </NavLink>
            <NavLink to={paths.results()}>
              <ListChecks aria-hidden="true" />
              Results
            </NavLink>
            <NavLink to={paths.reports}>
              <FileText aria-hidden="true" />
              Reports
            </NavLink>
          </nav>
          <div className="side-foot">
            <b>Catch AI hallucinations</b>
            Every reference is checked against Crossref and OpenAlex, including retraction notices.
          </div>
        </aside>

        <main id="main" tabIndex={-1}>
          <div className="page">
            {page !== 'dashboard' && (
              <div className="crumbbar">
                <button type="button" className="back" onClick={goBack}>
                  <ArrowLeft className="ic" aria-hidden="true" /> Back
                  <span className="sr"> to {back.label}</span>
                </button>
                <nav className="crumbs" aria-label="Breadcrumb">
                  <ol>
                    {crumbs(page, parts, summaries).map(([name, to], i) => (
                      <li key={name}>
                        {i > 0 && <ChevronRight className="sep" aria-hidden="true" />}
                        {to ? <Link to={to}>{name}</Link> : <span aria-current="page">{name}</span>}
                      </li>
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
                <Empty icon={WifiOff} title="Siyasat can't be reached">
                  <h1 className="sr">Siyasat can't be reached</h1>
                  We couldn't load your saved checks. Check your internet connection and try again.
                  <div className="actions">
                    <button type="button" className="primary" onClick={() => void initChecks()}>
                      Try again
                    </button>
                  </div>
                </Empty>
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
          </div>
        </main>
      </div>

      <nav className="tabbar" aria-label="Main">
        <NavLink to={paths.dashboard} end>
          <LayoutDashboard aria-hidden="true" />
          Dashboard
        </NavLink>
        <NavLink to={paths.newCheck()}>
          <Plus aria-hidden="true" />
          New check
        </NavLink>
        <NavLink to={paths.results()}>
          <ListChecks aria-hidden="true" />
          Results
        </NavLink>
        <NavLink to={paths.reports}>
          <FileText aria-hidden="true" />
          Reports
        </NavLink>
      </nav>

      <Toast />
      <Dialog />
    </>
  );
}
