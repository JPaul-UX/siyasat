import { Activity, LayoutDashboard, ShieldCheck, Users } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Route, Routes } from 'react-router';
import { PageHead } from '../../components/bits';
import { paths } from '../../lib/nav';
import { loadAdminSettings, toggleSignups, useAdminSettings } from '../../store/admin';
import { AdminActivity } from './AdminActivity';
import { AdminOverviewPage } from './AdminOverview';
import { AdminUserPage } from './AdminUser';
import { AdminUsers } from './AdminUsers';

/** A switch for whether new accounts can be made: the first thing to reach for when sign-ups are being abused. */
function SignupsSwitch() {
  const open = useAdminSettings((s) => s.signupsOpen);
  if (open === null) return null;
  return (
    <button type="button" role="switch" aria-checked={open} className={`switch ${open ? 'on' : 'off'}`} onClick={() => void toggleSignups()}>
      <span className="track" aria-hidden="true">
        <span className="thumb" />
      </span>
      <span className="txt">
        <b>New sign-ups</b>
        <small>{open ? 'Open to anyone' : 'Paused'}</small>
      </span>
    </button>
  );
}

/** The super admin's dashboard. */
export function Admin() {
  useEffect(() => void loadAdminSettings(), []);
  return (
    <>
      <PageHead
        eyebrow={
          <>
            <ShieldCheck className="ic" aria-hidden="true" /> Super admin
          </>
        }
        title="Admin"
        lead="Who has signed up, how they use Siyasat, and anything that looks like abuse."
      >
        <SignupsSwitch />
      </PageHead>
      <nav className="seg admin-tabs" aria-label="Admin sections">
        <NavLink to={paths.admin} end>
          <LayoutDashboard aria-hidden="true" /> Overview
        </NavLink>
        <NavLink to={paths.adminUsers}>
          <Users aria-hidden="true" /> Accounts
        </NavLink>
        <NavLink to={paths.adminActivity}>
          <Activity aria-hidden="true" /> Activity
        </NavLink>
      </nav>
      <Routes>
        <Route index element={<AdminOverviewPage />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="users/:id" element={<AdminUserPage />} />
        <Route path="activity" element={<AdminActivity />} />
        <Route path="*" element={<AdminOverviewPage />} />
      </Routes>
    </>
  );
}
