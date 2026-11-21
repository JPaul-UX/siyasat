import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { Logo } from './components/Logo';
import { Shell } from './components/Shell';
import { Dialog } from './components/Dialog';
import { Toast } from './components/Toast';
import { setAuthProblemHandler } from './lib/api';
import { setNavigate } from './lib/nav';
import { Admin } from './pages/Admin';
import { Dashboard } from './pages/Dashboard';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { NewCheck } from './pages/NewCheck';
import { Pending } from './pages/Pending';
import { Reader } from './pages/Reader';
import { HowItWorks } from './pages/HowItWorks';
import { Reports } from './pages/Reports';
import { Results } from './pages/Results';
import { Signup } from './pages/Signup';
import { UploadPage } from './pages/UploadPage';
import { loadSession, useSession } from './store/session';

function Boot() {
  return (
    <div className="boot-page" role="status">
      <Logo tone="maroon" size={48} />
      <span>Loading Siyasat…</span>
    </div>
  );
}

/** Login and signup are for people who are not signed in yet. */
function GuestOnly({ children }: { children: ReactNode }) {
  const user = useSession((s) => s.user);
  if (user?.status === 'APPROVED') return <Navigate to="/" replace />;
  if (user) return <Navigate to="/pending" replace />;
  return children;
}

function ToLogin() {
  const loc = useLocation();
  const next = loc.pathname + loc.search;
  return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
}

export function App() {
  const navigate = useNavigate();
  const status = useSession((s) => s.status);
  const user = useSession((s) => s.user);

  useEffect(() => setNavigate(navigate), [navigate]);
  useEffect(() => {
    setAuthProblemHandler(() => void loadSession());
    void loadSession();
  }, []);

  if (status === 'loading') return <Boot />;

  const approved = user?.status === 'APPROVED';

  return (
    <>
      <Routes>
        <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} />
        <Route path="/pending" element={<Pending />} />
        {approved ? (
          <Route element={<Shell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/new/:type?" element={<NewCheck />} />
            <Route path="/results/:id?/:view?" element={<Results />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/read" element={<Reader />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/admin" element={user?.role === 'ADMIN' ? <Admin /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Dashboard />} />
          </Route>
        ) : user ? (
          <Route path="*" element={<Navigate to="/pending" replace />} />
        ) : (
          <>
            <Route path="/" element={<Landing />} />
            <Route path="*" element={<ToLogin />} />
          </>
        )}
      </Routes>
      <Toast />
      <Dialog />
    </>
  );
}
