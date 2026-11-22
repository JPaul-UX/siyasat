import type { AdminUserDetail, AdminUserRow } from '@siyasat/core';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { adminApi, ApiError } from '../../lib/api';
import { refreshPending } from '../../store/admin';
import { confirmDialog } from '../../store/dialog';
import { toast } from '../../store/toast';
import { Spinner } from '../bits';

/**
 * Approve or decline one sign-up. Approving needs no confirmation: it can be undone by suspending. Declining
 * asks first, since the person is signed out and can't sign in again unless approved later.
 */
export function ApprovalButtons({
  user,
  onDone,
  size = 'sm',
}: {
  user: Pick<AdminUserRow, 'id' | 'name' | 'status'>;
  onDone: (detail: AdminUserDetail) => void;
  size?: 'sm' | 'md';
}) {
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);
  const sm = size === 'sm' ? ' sm' : '';

  const run = async (action: 'approve' | 'decline') => {
    if (
      action === 'decline' &&
      !(await confirmDialog({
        title: `Decline ${user.name}’s sign-up?`,
        body: 'They are signed out and can’t sign in or run checks. You can still approve them later from Accounts.',
        confirmLabel: 'Decline sign-up',
        danger: true,
      }))
    )
      return;
    setBusy(action);
    try {
      const detail = await adminApi[action](user.id);
      toast(action === 'approve' ? `Approved ${user.name}. They can use Siyasat now.` : `Declined ${user.name}’s sign-up`);
      void refreshPending();
      onDone(detail);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't do that. Check your connection.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <span className="approval">
      {user.status === 'pending' && (
        <button type="button" className={`ghost${sm} danger-btn`} disabled={!!busy} onClick={() => void run('decline')}>
          {busy === 'decline' ? <Spinner /> : <X className="ic" aria-hidden="true" />} Decline<span className="sr"> {user.name}</span>
        </button>
      )}
      <button type="button" className={`approve${sm}`} disabled={!!busy} onClick={() => void run('approve')}>
        {busy === 'approve' ? <Spinner /> : <Check className="ic" aria-hidden="true" />}
        {user.status === 'rejected' ? 'Approve after all' : 'Approve'}
        <span className="sr"> {user.name}</span>
      </button>
    </span>
  );
}
