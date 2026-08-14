import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { monthLabel, pretty, toDateInput } from "../lib/format";
import { QueryState } from "../components/QueryState";
import RecordModal, { ConfirmModal } from "../components/RecordModal";
import { CONTENT_STAGES } from "../lib/contentStages";
import PostCard from "../components/PostCard";
import { useToast } from "../lib/useToast";

const PLATFORMS = ["INSTAGRAM", "FACEBOOK", "LINKEDIN", "YOUTUBE", "GMB"];
const POST_TYPES = ["STATIC", "REEL", "CAROUSEL", "STORY", "BLOG"];
const STATUSES = CONTENT_STAGES.map((stage) => ({ value: stage.value, label: stage.label }));
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function ContentCalendar({ readOnly = false }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const today = new Date();

  // The client id used to be hard-coded to the demo record "c-1", so on a real database
  // the calendar loaded nothing until you manually picked a client.
  const [chosenClientId, setChosenClientId] = useState("");
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: () => api("/clients") });
  const clients = useMemo(() => clientsQuery.data?.data || [], [clientsQuery.data]);
  // Falling back to the first client keeps the picker and the query in step without an
  // effect that writes state during render.
  const clientId = chosenClientId || clients[0]?.id || "";

  const query = useQuery({
    queryKey: ["calendar", clientId, month, year],
    queryFn: () => api(`/calendar?clientId=${encodeURIComponent(clientId)}&month=${month}&year=${year}`),
    enabled: Boolean(clientId)
  });
  const items = useMemo(() => query.data?.data || [], [query.data]);

  const grid = useMemo(() => buildMonthGrid(month, year, items), [month, year, items]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  function changeMonth(delta) {
    const next = new Date(year, month - 1 + delta, 1);
    setMonth(next.getMonth() + 1);
    setYear(next.getFullYear());
  }

  async function saveItem(payload) {
    await api(editing?.id ? `/calendar/${editing.id}` : "/calendar", {
      method: editing?.id ? "PUT" : "POST",
      body: JSON.stringify({
        ...payload,
        clientId,
        month,
        year,
        scheduledDate: payload.scheduledDate || new Date(year, month - 1, 1).toISOString()
      })
    });
    notify(editing?.id ? "Post updated." : "Post added.");
    refresh();
  }

  async function bulkGenerate() {
    setBusy(true);
    try {
      const result = await api("/calendar/bulk", {
        method: "POST",
        body: JSON.stringify({ clientId, month, year, count: 26, platform: "INSTAGRAM" })
      });
      notify(result.created ? `${result.created} draft posts added.` : result.message || "Nothing to add.");
      refresh();
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy(false);
    }
  }


  async function deleteItem(item) {
    await api(`/calendar/${item.id}`, { method: "DELETE" });
    notify("Post removed.");
    refresh();
  }

  const fields = [
    { name: "platform", label: "Platform", options: PLATFORMS, required: true },
    { name: "postType", label: "Post type", options: POST_TYPES, required: true },
    { name: "scheduledDate", label: "Scheduled date", kind: "date", type: "date" },
    { name: "status", label: "Status", options: STATUSES, required: true },
    { name: "caption", label: "Caption", rows: 3 },
    { name: "designBrief", label: "Design brief", rows: 3 }
  ];

  if (clientsQuery.isSuccess && !clients.length) {
    return <div className="empty-state"><h3>No clients yet</h3><p>Add a client before planning their content.</p></div>;
  }

  return <div className="space-y-4">
    <div className="toolbar">
      <select className="input max-w-full sm:max-w-xs" value={clientId} onChange={(event) => setChosenClientId(event.target.value)}>
        {clients.map((client) => <option key={client.id} value={client.id}>{client.businessName}</option>)}
      </select>
      <div className="flex flex-wrap items-center gap-2">
        <button className="icon-button" onClick={() => changeMonth(-1)} aria-label="Previous month"><ChevronLeft size={17} /></button>
        <span className="month-pill">{monthLabel(month, year)}</span>
        <button className="icon-button" onClick={() => changeMonth(1)} aria-label="Next month"><ChevronRight size={17} /></button>
        {!readOnly && <>
          <button className="secondary-button" onClick={bulkGenerate} disabled={busy || !clientId}>
            <CalendarPlus size={15} /> {busy ? "Adding..." : "Fill month"}
          </button>
          <button className="primary" onClick={() => setEditing({ platform: "INSTAGRAM", postType: "STATIC", status: "DRAFT" })}>
            <Plus size={16} /> Add post
          </button>
        </>}
      </div>
    </div>

    <QueryState query={query} label="content plan">
      <>
        {/* A 7-column grid of 30 boxes is unreadable at 375px, so phones get a
            chronological list and the grid appears from tablet width up. */}
        <div className="space-y-3 lg:hidden">
          {items.length === 0 && <p className="empty-state">No posts planned for {monthLabel(month, year)}.</p>}
          {items.map((item) => <div key={item.id}>
            <PostCard
              post={item}
              client={clients.find((entry) => entry.id === clientId)}
              readOnly={readOnly}
              onChanged={refresh}
            />
            {!readOnly && <div className="record-card-actions -mt-2 px-1">
              <button className="table-action" onClick={() => setEditing({ ...item, scheduledDate: toDateInput(item.scheduledDate) })}>
                Edit caption &amp; brief
              </button>
              <button className="danger-action" onClick={() => setDeleting(item)}><Trash2 size={14} /> Remove</button>
            </div>}
          </div>)}
        </div>

        <div className="panel hidden lg:block">
          <h2 className="section-title">{monthLabel(month, year)}</h2>
          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-black uppercase text-zinc-400">
            {WEEKDAYS.map((day) => <div key={day}>{day}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-2">
            {grid.map((cell, index) => <div key={index} className={`calendar-cell ${cell ? "" : "empty"}`}>
              {cell && <>
                <div className="text-xs font-black text-slate-500">{cell.day}</div>
                <div className="mt-1 space-y-1">
                  {cell.items.map((item) => <button
                    key={item.id}
                    className={`calendar-chip ${item.status.toLowerCase()}`}
                    onClick={() => !readOnly && setEditing({ ...item, scheduledDate: toDateInput(item.scheduledDate) })}
                  >{pretty(item.platform).slice(0, 4)} · {pretty(item.postType).slice(0, 6)}</button>)}
                </div>
              </>}
            </div>)}
          </div>
        </div>
      </>
    </QueryState>

    {editing && <RecordModal
      title={editing.id ? "Edit post" : "Add post"}
      initial={editing}
      fields={fields}
      onSubmit={saveItem}
      onClose={() => setEditing(null)}
    />}
    {deleting && <ConfirmModal
      title="Remove post"
      message={`Remove this ${pretty(deleting.platform)} ${pretty(deleting.postType)} from the plan?`}
      confirmLabel="Remove post"
      onConfirm={() => deleteItem(deleting)}
      onClose={() => setDeleting(null)}
    />}
  </div>;
}

// The old grid rendered days 1..N straight into a 7-column layout, so every date landed
// under the wrong weekday. This pads the first week so dates line up (Monday first).
function buildMonthGrid(month, year, items) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const cells = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      day,
      items: items.filter((item) => {
        if (!item.scheduledDate) return false;
        const date = new Date(item.scheduledDate);
        return date.getDate() === day && date.getMonth() === month - 1 && date.getFullYear() === year;
      })
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
