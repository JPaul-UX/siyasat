import { Undo2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { dismissToast, runUndo, useToast } from '../store/toast';

const SHOW_FOR_MS = 8000;

/** The message bar at the bottom of the screen. Stays while the pointer or keyboard focus is on it. */
export function Toast() {
  const toast = useToast((s) => s.toast);
  const [held, setHeld] = useState(false);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!toast) {
      setVisible(false);
      return;
    }
    // Let the bar render off-screen first, so that it slides in.
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [toast]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (toast && !held) timer.current = setTimeout(dismissToast, SHOW_FOR_MS);
    return () => clearTimeout(timer.current);
  }, [toast, held]);

  const undo = toast?.undo;
  const action = toast?.action;
  return (
    <div
      className={`toast${toast && visible ? ' show' : ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      {toast && (
        <>
          <span>{toast.message}</span>
          {undo && (
            <button
              type="button"
              className="tu"
              aria-label={`Undo: ${toast.message}`}
              onClick={() => {
                dismissToast();
                runUndo(undo);
              }}
            >
              <Undo2 className="ic" aria-hidden="true" /> Undo
            </button>
          )}
          {action && (
            <button
              type="button"
              onClick={() => {
                dismissToast();
                action.run();
              }}
            >
              {action.label}
            </button>
          )}
          <button type="button" className="tx" aria-label="Dismiss" onClick={dismissToast}>
            <X className="ic" aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}
