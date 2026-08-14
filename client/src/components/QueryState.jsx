import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

/**
 * Wraps a react-query result. Pages used to render `if (!data) return "Loading..."`,
 * which meant a failed request left the screen loading for ever with no way to retry.
 */
export function QueryState({ query, empty, children, label = "records" }) {
  if (query.isPending) return <LoadingPanel label={label} />;
  if (query.isError) return <ErrorPanel error={query.error} onRetry={() => query.refetch()} />;
  if (empty) return empty;
  return children;
}

export function LoadingPanel({ label = "records" }) {
  return <div className="panel flex items-center gap-3 text-sm font-bold text-zinc-500">
    <Loader2 size={18} className="animate-spin text-[#ff7a18]" />
    Loading {label}...
  </div>;
}

export function ErrorPanel({ error, onRetry }) {
  const offline = error?.status === 0;
  return <div className="panel">
    <div className="flex items-start gap-3">
      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-[#be123c]" />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-black">{offline ? "You appear to be offline" : "Could not load this page"}</h2>
        <p className="mt-1 text-sm font-semibold leading-6 text-zinc-600">
          {error?.message || "Something went wrong."}
        </p>
        {onRetry && <button className="secondary-button mt-3" onClick={onRetry}><RefreshCw size={15} /> Try again</button>}
      </div>
    </div>
  </div>;
}

export function EmptyState({ title, message, action }) {
  return <div className="empty-state">
    <h3>{title}</h3>
    <p>{message}</p>
    {action}
  </div>;
}
