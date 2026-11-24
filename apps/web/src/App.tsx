import type { CheckSummary } from '@siyasat/core';
import { ArrowLeft, ChevronRight, FileText, LayoutDashboard, ListChecks, Plus, ShieldCheck, ShieldX, WifiOff, Workflow } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router';
import { SideAccount, TopAccount } from './components/AccountMenu';
import { Empty, Logo, Spinner } from './components/bits';
import { Dialog } from './components/Dialog';
import { Toast } from './components/Toast';
import { setSessionProblemHandler } from './lib/api';
import { backTarget, paths, safeNext, setNavigate, trackVisit, typeName } from './lib/nav';
import { AuthPage } from './pages/AuthPage';
import { Landing } from './pages/Landing';
import { PendingApproval } from './pages/PendingApproval';
import { Dashboard } from './pages/Dashboard';
import { NewCheck } from './pages/NewCheck';
import { Reader } from './pages/Reader';
import { HowItWorks } from './pages/HowItWorks';
import { Reports } from './pages/Reports';
import { Results } from './pages/Results';
import { UploadPage } from './pages/UploadPage';
import { refreshPending, useAdminSettings } from './store/admin';
import { initAuth, isSuperAdmin, isWaiting, sessionProblem, useAuth } from './store/auth';
import { initChecks, useChecks } from './store/checks';
import { stopEditing, useForms } from './store/forms';

const TITLES: Record<string, string> = {
  new: 'New check',
  results: 'Results',
  reports: 'Reports',
  'how-it-works': 'How it works',
  read: 'Full-text reader',
  upload: 'Upload & check',
  admin: 'Admin',
};

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
  else if (page === 'how-it-works') trail.push(['How it works', null]);
  else if (page === 'upload') trail.push(['Upload & check', null]);
  else if (page === 'read') trail.push(['Results', paths.results()], ['Full-text reader', null]);
  else if (page === 'admin') {
    const [section, id] = parts;
    trail.push(['Admin', section ? paths.admin : null]);
    if (section === 'users') {
      trail.push(['Accounts', id ? paths.adminUsers : null]);
      if (id) trail.push(['Account', null]);
    } else if (section === 'activity') trail.push(['Activity', null]);
  }
  return trail;
}

/** Only the super admin opens these pages, so everyone else never downloads them. */
const Admin = lazy(() => import('./pages/admin/Admin').then((m) => ({ default: m.Admin })));

/** Signing in comes first: nothing but the sign-in and sign-up pages works without an account. */
export function App() {
  const status = useAuth((s) => s.status);
  const waiting = useAuth((s) => isWaiting(s.user));

  useEffect(() => {
    setSessionProblemHandler(sessionProblem);
    void initAuth();
  }, []);

  if (status === 'loading') {
    return (
      <div className="boot full" role="status">
        <Logo tone="maroon" size={52} />
        <span>
          <Spinner /> Opening Siyasat…
        </span>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <main className="boot full" id="main">
        <Empty icon={WifiOff} title="Siyasat can't be reached">
          <h1 className="sr">Siyasat can't be reached</h1>
          Check your internet connection and try again.
          <div className="actions">
            <button type="button" className="primary" onClick={() => void initAuth()}>
              Try again
            </button>
          </div>
        </Empty>
      </main>
    );
  }
  if (status === 'signed-out') return <SignedOut />;
  // Signed in, but nothing opens until the super admin approves the account.
  if (waiting) return <PendingApproval />;
  return <Shell />;
}

function SignedOut() {
  const location = useLocation();
  if (location.pathname === paths.signUp) return <AuthPage mode="signup" />;
  if (location.pathname === paths.signIn) return <AuthPage mode="signin" />;
  // The front page says what Siyasat is, and how to get in.
  if (location.pathname === '/') return <Landing />;
  // Remember where they were going, and go there once they have signed in.
  const here = location.pathname + location.search;
  return <Navigate to={`${paths.signIn}?next=${encodeURIComponent(here)}`} replace />;
}

function NotAllowed() {
  return (
    <section className="card">
      <Empty icon={ShieldX} title="Only the super admin can open this page">
        <h1 className="sr">Not allowed</h1>
        <div className="actions">
          <Link className="btn primary" to={paths.dashboard}>
            Go to the dashboard
          </Link>
        </div>
      </Empty>
    </section>
  );
}

function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const status = useChecks((s) => s.status);
  const summaries = useChecks((s) => s.summaries);
  const user = useAuth((s) => s.user);
  const admin = isSuperAdmin(user);
  const pending = useAdminSettings((s) => s.pending);
  const [search] = useSearchParams();
  const [page = 'dashboard', ...parts] = location.pathname.split('/').filter(Boolean);
  const here = location.pathname + location.search;

  // Recorded while rendering so the Back button below already knows where "back" is.
  if (page !== 'signin' && page !== 'signup') trackVisit(here);
  const back = backTarget(here);
  const goBack = () => (back.viaHistory ? navigate(-1) : navigate(back.to));

  useEffect(() => setNavigate(navigate), [navigate]);
  useEffect(() => void initChecks(), []);

  // The super admin sees how many sign-ups are waiting, wherever they are in the app.
  useEffect(() => {
    if (!admin) return;
    void refreshPending();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refreshPending();
    }, 60_000);
    return () => clearInterval(timer);
  }, [admin]);

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

  // Just signed in: go where they were headed.
  if (page === 'signin' || page === 'signup') return <Navigate to={safeNext(search.get('next'))} replace />;

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
        <TopAccount />
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
            <NavLink to={paths.how}>
              <Workflow aria-hidden="true" />
              How it works
            </NavLink>
          </nav>
          {admin && (
            <nav className="nav nav-admin" aria-label="Admin">
              <span className="nav-label">Super admin</span>
              <NavLink to={paths.admin}>
                <ShieldCheck aria-hidden="true" />
                Admin
                {pending > 0 && (
                  <span className="nav-badge" title={`${pending} waiting for approval`}>
                    {pending}
                    <span className="sr"> waiting for approval</span>
                  </span>
                )}
              </NavLink>
            </nav>
          )}
          <div className="side-foot">
            <b>Catch AI hallucinations</b>
            Every reference is checked against Crossref and OpenAlex, including retraction notices.
          </div>
          <SideAccount />
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
                <Route path="/how-it-works" element={<HowItWorks />} />
                <Route path="/read" element={<Reader />} />
                <Route path="/upload" element={<UploadPage />} />
                <Route
                  path="/admin/*"
                  element={
                    admin ? (
                      <Suspense
                        fallback={
                          <div className="boot" role="status">
                            <Spinner /> Loading the admin dashboard…
                          </div>
                        }
                      >
                        <Admin />
                      </Suspense>
                    ) : (
                      <NotAllowed />
                    )
                  }
                />
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
        <NavLink to={paths.how} aria-label="How it works">
          <Workflow aria-hidden="true" />
          Method
        </NavLink>
      </nav>

      <Toast />
      <Dialog />
    </>
  );
}
