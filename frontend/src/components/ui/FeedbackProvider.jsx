import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const FeedbackContext = createContext(null);

function ToastViewport({ toasts, onDismiss }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-[22px] border px-4 py-3 shadow-[0_16px_34px_rgba(38,28,18,0.08)] backdrop-blur-sm ${toast.type === 'error'
              ? 'border-[color:rgba(169,77,68,0.24)] bg-[rgba(255,247,244,0.96)] text-[color:var(--ink)]'
              : toast.type === 'success'
                ? 'border-[color:rgba(77,117,90,0.22)] bg-[rgba(248,252,247,0.96)] text-[color:var(--ink)]'
                : toast.type === 'warning'
                  ? 'border-[color:rgba(154,103,35,0.22)] bg-[rgba(255,250,241,0.96)] text-[color:var(--ink)]'
                  : 'border-[color:var(--border)] bg-[rgba(255,252,247,0.97)] text-[color:var(--ink)]'
            }`}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {toast.title ? (
                <p className="text-sm font-semibold tracking-[-0.01em]">{toast.title}</p>
              ) : null}
              <p className="text-sm leading-6 text-[color:var(--ink-muted)]">{toast.message}</p>
            </div>
            <button
              type="button"
              className="rounded-full px-2 py-1 text-xs font-medium text-[color:var(--ink-muted)] transition hover:bg-black/5 hover:text-[color:var(--ink)]"
              onClick={() => onDismiss(toast.id)}
            >
              关闭
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ConfirmDialog({ dialog, onClose, onConfirm }) {
  if (!dialog) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/28 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-[30px] border border-[color:var(--border)] bg-[color:var(--paper-strong)] p-6 shadow-[0_32px_80px_rgba(38,28,18,0.18)]">
        <div className="mb-4">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.32em] text-[color:var(--ink-muted)]">
            请确认
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--ink)]">
            {dialog.title}
          </h2>
          <p className="mt-3 text-sm leading-7 text-[color:var(--ink-muted)]">{dialog.message}</p>
        </div>
        {dialog.note ? (
          <div className="mb-6 rounded-[22px] border border-[color:rgba(154,103,35,0.22)] bg-[rgba(255,248,236,0.88)] px-4 py-3 text-sm leading-6 text-[color:var(--ink)]">
            {dialog.note}
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="rounded-full border border-[color:var(--border)] bg-[rgba(255,255,255,0.55)] px-4 py-2 text-sm font-medium text-[color:var(--ink-muted)] transition hover:border-[color:rgba(139,101,55,0.35)] hover:bg-white"
          >
            {dialog.cancelText || '取消'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-full px-4 py-2 text-sm font-medium text-white transition ${dialog.variant === 'danger'
                ? 'bg-[color:var(--danger)] hover:brightness-95'
                : 'bg-slate-500 hover:brightness-110'
              }`}
          >
            {dialog.confirmText || '确认'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);
  const toastTimersRef = useRef(new Map());

  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      toastTimersRef.current.clear();

      if (resolverRef.current) {
        resolverRef.current(false);
        resolverRef.current = null;
      }
    };
  }, []);

  const clearToastTimer = useCallback((id) => {
    const timerId = toastTimersRef.current.get(id);
    if (timerId) {
      window.clearTimeout(timerId);
      toastTimersRef.current.delete(id);
    }
  }, []);

  const dismissToast = useCallback((id) => {
    clearToastTimer(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, [clearToastTimer]);

  const toast = useCallback((message, options = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const nextToast = { id, message, ...options };
    setToasts((current) => [...current, nextToast]);

    const duration = options.duration ?? 3200;
    const timerId = window.setTimeout(() => {
      toastTimersRef.current.delete(id);
      dismissToast(id);
    }, duration);
    toastTimersRef.current.set(id, timerId);
  }, [dismissToast]);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      if (resolverRef.current) {
        resolverRef.current(false);
      }
      resolverRef.current = resolve;
      setDialog(options);
    });
  }, []);

  const closeDialog = useCallback((result) => {
    setDialog(null);
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
  }, []);

  const value = useMemo(
    () => ({
      toast,
      success: (message, options = {}) => toast(message, { ...options, type: 'success' }),
      error: (message, options = {}) => toast(message, { ...options, type: 'error', duration: 4800 }),
      warning: (message, options = {}) => toast(message, { ...options, type: 'warning' }),
      confirm,
    }),
    [confirm, toast]
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      <ConfirmDialog dialog={dialog} onClose={closeDialog} onConfirm={() => closeDialog(true)} />
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within FeedbackProvider');
  }

  return context;
}
