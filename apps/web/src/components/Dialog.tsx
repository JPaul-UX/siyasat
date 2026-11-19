import { useEffect, useRef } from 'react';
import { answerDialog, useDialog } from '../store/dialog';

/** The app's one modal dialog. The browser's <dialog> keeps focus inside it and closes it on Escape. */
export function Dialog() {
  const request = useDialog((s) => s.current);
  const el = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = el.current;
    if (!dialog) return;
    if (request && !dialog.open) dialog.showModal();
    if (!request && dialog.open) dialog.close();
  }, [request]);

  return (
    <dialog
      ref={el}
      className="dialog"
      aria-labelledby="dialogTitle"
      onClose={() => answerDialog(false)}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === el.current) answerDialog(false);
      }}
    >
      {request && (
        <>
          <h2 id="dialogTitle">{request.title}</h2>
          {request.body && <p>{request.body}</p>}
          <div className="actions">
            {request.cancelLabel !== null && (
              <button type="button" className="ghost" onClick={() => answerDialog(false)}>
                {request.cancelLabel ?? 'Cancel'}
              </button>
            )}
            <button type="button" className={`primary${request.danger ? ' danger' : ''}`} autoFocus onClick={() => answerDialog(true)}>
              {request.confirmLabel ?? 'OK'}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
