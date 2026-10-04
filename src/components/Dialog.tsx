import { type ReactNode, useEffect, useId, useRef } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

/** Native modal dialog: focus is trapped, Escape and a backdrop tap close it. */
export function Dialog({ open, onClose, title, children, className = '' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-labelledby={titleId}
      // The close event arrives a tick late; ignore it if the dialog has already been reopened.
      onClose={() => !ref.current?.open && onClose()}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="dialog__body">
          <h2 id={titleId} className="dialog__title">
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <p className="dialog__text">{message}</p>
      <div className="dialog__actions">
        <button type="button" className="btn btn--quiet" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => {
            onConfirm();
            onCancel();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
