import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import { pretty, shortDate } from "../lib/format";
import { useToast } from "../lib/useToast";

export default function NotificationPanel({ items = [], onClose }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();

  async function markAllRead() {
    try {
      await api("/notifications/read-all", { method: "PUT" });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      notify("Marked all as read.");
      onClose();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return <>
    <button type="button" className="sheet-scrim" aria-label="Close notifications" onClick={onClose} />
    <div className="notification-panel">
      <div className="flex items-center justify-between gap-3 border-b border-black/10 p-4">
        <div>
          <h2 className="text-sm font-black">Today&rsquo;s action centre</h2>
          <p className="text-xs font-semibold text-zinc-500">{items.length} item{items.length === 1 ? "" : "s"} need attention</p>
        </div>
        <button type="button" className="table-action" onClick={markAllRead}>Mark all read</button>
      </div>
      <div className="max-h-[60vh] overflow-auto p-2">
        {items.length === 0 && <div className="p-5 text-center text-sm font-semibold text-zinc-500">Nothing due today. Nice and quiet.</div>}
        {items.map((item) => <Link key={item.id} to={item.link || "/dashboard"} onClick={onClose} className="notification-item">
          <div className={`notification-dot ${item.priority === "HIGH" ? "high" : ""}`} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-black">{item.title || pretty(item.type)}</span>
              <span className="rounded-full bg-[#fff3ce] px-2 py-0.5 text-[10px] font-black text-[#6a4700]">{pretty(item.type)}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-zinc-600">{item.message}</p>
            {item.dueAt && <p className="mt-1 text-[11px] font-bold text-zinc-400">Due {shortDate(item.dueAt)}</p>}
          </div>
          <ChevronRight size={16} className="shrink-0 text-zinc-400" />
        </Link>)}
      </div>
    </div>
  </>;
}
