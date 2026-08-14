import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { ToastContext } from "../lib/useToast";

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((current) => current.filter((item) => item.id !== id)), []);

  const notify = useCallback((message, tone = "success") => {
    if (!message) return;
    const id = nextId++;
    setToasts((current) => [...current.slice(-2), { id, message: String(message), tone }]);
  }, []);

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return <ToastContext.Provider value={value}>
    {children}
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => <Toast key={toast.id} toast={toast} onDismiss={dismiss} />)}
    </div>
  </ToastContext.Provider>;
}

function Toast({ toast, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.tone === "error" ? 6000 : 3500);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  return <div className={`toast ${toast.tone}`}>
    {toast.tone === "error" ? <AlertTriangle size={17} className="shrink-0" /> : <CheckCircle2 size={17} className="shrink-0" />}
    <span className="flex-1">{toast.message}</span>
    <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss"><X size={15} /></button>
  </div>;
}
