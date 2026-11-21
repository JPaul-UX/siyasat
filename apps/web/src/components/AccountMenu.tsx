import { LogOut, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { paths } from '../lib/nav';
import { isSuperAdmin, signOut, useAuth } from '../store/auth';
import { Avatar } from './admin/parts';

/** The signed-in account at the foot of the sidebar, with a way to sign out. */
export function SideAccount() {
  const user = useAuth((s) => s.user);
  if (!user) return null;
  return (
    <div className="side-account">
      <Avatar name={user.name} admin={isSuperAdmin(user)} size={34} />
      <div className="who">
        <b>{user.name}</b>
        <small>{user.email}</small>
      </div>
      <button type="button" className="icon-btn" onClick={() => void signOut()} aria-label="Sign out" title="Sign out">
        <LogOut className="ic" aria-hidden="true" />
      </button>
    </div>
  );
}

/** On small screens: the account's initials in the top bar, opening a menu. */
export function TopAccount() {
  const user = useAuth((s) => s.user);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!user) return null;
  return (
    <div className="top-account" ref={box}>
      <button type="button" className="avatar-btn" aria-expanded={open} aria-haspopup="true" aria-label={`Account: ${user.name}`} onClick={() => setOpen((o) => !o)}>
        <Avatar name={user.name} admin={isSuperAdmin(user)} size={32} />
      </button>
      {open && (
        <div className="acct-pop">
          <div className="acct-who">
            <b>{user.name}</b>
            <small>{user.email}</small>
          </div>
          {isSuperAdmin(user) && (
            <Link to={paths.admin}>
              <ShieldCheck className="ic" aria-hidden="true" /> Admin dashboard
            </Link>
          )}
          <button type="button" onClick={() => void signOut()}>
            <LogOut className="ic" aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
