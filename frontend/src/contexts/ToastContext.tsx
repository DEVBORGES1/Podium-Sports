import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ToastState {
  message: string;
  tone: 'ok' | 'error';
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  show: (message: string, options?: { tone?: 'ok' | 'error'; action?: ToastState['action'] }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Toast único no estilo do site original ("✓ Produto na sacola · Ver sacola"), com aria-live. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback<ToastApi['show']>((message, options) => {
    setToast({ message, tone: options?.tone ?? 'ok', action: options?.action });
    setVisible(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(false), options?.tone === 'error' ? 4500 : 2600);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className={`toast ${visible ? 'show' : ''} ${toast?.tone === 'error' ? 'error' : ''}`} role="status" aria-live="polite">
        {toast && (
          <>
            <i aria-hidden>{toast.tone === 'error' ? '!' : '✓'}</i>
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  setVisible(false);
                  toast.action?.onClick();
                }}
              >
                {toast.action.label}
              </button>
            )}
          </>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast fora do ToastProvider');
  return ctx;
}
