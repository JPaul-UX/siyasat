/* The super admin's site-wide settings. */
import { create } from 'zustand';
import { adminApi, ApiError } from '../lib/api';
import { confirmDialog } from './dialog';
import { toast } from './toast';

export const useAdminSettings = create<{ signupsOpen: boolean | null }>(() => ({ signupsOpen: null }));

export async function loadAdminSettings(): Promise<void> {
  try {
    const { signupsOpen } = await adminApi.settings();
    useAdminSettings.setState({ signupsOpen });
  } catch (e) {
    console.error(e);
  }
}

/** Pause or open sign-ups. Pausing asks first. */
export async function toggleSignups(): Promise<void> {
  const open = useAdminSettings.getState().signupsOpen;
  if (open === null) return;
  if (open) {
    const sure = await confirmDialog({
      title: 'Pause new sign-ups?',
      body: 'No one new can create an account until you open sign-ups again. People who already have an account can still sign in and run checks.',
      confirmLabel: 'Pause sign-ups',
      danger: true,
    });
    if (!sure) return;
  }
  try {
    const { signupsOpen } = await adminApi.setSignupsOpen(!open);
    useAdminSettings.setState({ signupsOpen });
    toast(signupsOpen ? 'Sign-ups are open again' : 'New sign-ups are paused');
  } catch (e) {
    toast(e instanceof ApiError ? e.message : "Couldn't change that. Check your connection.");
  }
}
