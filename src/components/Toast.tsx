import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';

interface ToastOptions {
  tone?: 'info' | 'error';
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
}

const ToastContext = createContext<{ show: (message: string, options?: ToastOptions) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const nextId = useRef(0);

  const show = useCallback((message: string, options: ToastOptions = {}) => {
    window.clearTimeout(timer.current);
    nextId.current += 1;
    setToast({ id: nextId.current, message, ...options });
    timer.current = window.setTimeout(() => setToast(null), options.tone === 'error' ? 6000 : 4000);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast ${toast.tone === 'error' ? 'toast--error' : ''}`}>
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  toast.action?.onClick();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
