/* A confirmation or a notice, shown as a dialog in the app's own style instead of the browser's. */
import { create } from 'zustand';

export interface DialogRequest {
  title: string;
  body?: string;
  confirmLabel?: string;
  /** Null for a notice with a single button. */
  cancelLabel?: string | null;
  /** The action destroys something: the confirm button is red. */
  danger?: boolean;
  resolve: (confirmed: boolean) => void;
}

export const useDialog = create<{ current: DialogRequest | null }>(() => ({ current: null }));

type Options = Omit<DialogRequest, 'resolve'>;

/** Ask the user to confirm something. Resolves to whether they did. */
export function confirmDialog(options: Options): Promise<boolean> {
  return new Promise((resolve) => {
    // A dialog that is still open is answered "no" before the new one takes its place.
    useDialog.getState().current?.resolve(false);
    useDialog.setState({ current: { cancelLabel: 'Cancel', ...options, resolve } });
  });
}

/** Tell the user something they need to acknowledge. */
export function notice(title: string, body?: string): Promise<boolean> {
  return confirmDialog({ title, body, confirmLabel: 'OK', cancelLabel: null });
}

export function answerDialog(confirmed: boolean): void {
  const { current } = useDialog.getState();
  if (!current) return;
  useDialog.setState({ current: null });
  current.resolve(confirmed);
}
