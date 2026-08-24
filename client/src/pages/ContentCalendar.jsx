import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, ListTodo, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { monthLabel, pretty, shortDate, toDateInput } from "../lib/format";
import { QueryState } from "../components/QueryState";
import RecordModal, { ConfirmModal } from "../components/RecordModal";
import { CONTENT_STAGES } from "../lib/contentStages";
import { tasksByDay, taskTypeLabel } from "../lib/contentTasks";
import PostCard from "../components/PostCard";
import ContentTodo from "../components/ContentTodo";
import { useToast } from "../lib/useToast";

const PLATFORMS = ["INSTAGRAM", "FACEBOOK", "LINKEDIN", "YOUTUBE", "GMB"];
const POST_TYPES = ["STATIC", "REEL", "CAROUSEL", "STORY", "BLOG"];
const STATUSES = CONTENT_STAGES.map((stage) => ({ value: stage.value, label: stage.label }));
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Which of the two views the Content page opens on, remembered per device. Most days the
// job is working the to-do list, so that is the default; whoever plans months at a time
// switches once to Calendar and it stays.
const TAB_KEY = "ob_content_tab";
const readStoredTab = () => {
  try {
    return localStorage.getItem(TAB_KEY) === "calendar" ? "calendar" : "todo";
  } catch {
    return "todo";
  }
};

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
  // The client portal mounts this page read-only and must never see the agency's own
  // work list, so it is pinned to the calendar rather than given a choice.
  const [tab, setTab] = useState(readStoredTab);
  const view = readOnly ? "calendar" : tab;

  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: () => api("/clients") });
  const clients = useMemo(() => clientsQuery.data?.data || [], [clientsQuery.data]);
  // Falling back to the first client keeps the picker and the query in step without an
  // effect that writes state during render.
  const clientId = chosenClientId || clients[0]?.id || "";
  const activeClient = useMemo(() => clients.find((entry) => entry.id === clientId), [clients, clientId]);

  const query = useQuery({
    queryKey: ["calendar", clientId, month, year],
    queryFn: () => api(`/calendar?clientId=${encodeURIComponent(clientId)}&month=${month}&year=${year}`),
    enabled: Boolean(clientId) && view === "calendar"
  });
  const items = useMemo(() => query.data?.data || [], [query.data]);

  // Same query key the To-do list uses, so the two tabs share one cache entry and ticking
  // a task off there is reflected here without a second round trip.
  const tasksQuery = useQuery({
    queryKey: ["content-tasks", clientId],
    queryFn: () => api(`/content-tasks?clientId=${encodeURIComponent(clientId)}`),
    enabled: Boolean(clientId) && view === "calendar"
  });
  const tasks = useMemo(() => tasksQuery.data?.data || [], [tasksQuery.data]);
  const taskDays = useMemo(() => tasksByDay(tasks, month, year), [tasks, month, year]);

  const grid = useMemo(() => buildMonthGrid(month, year, items, taskDays), [month, year, items, taskDays]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  function chooseTab(next) {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // Private browsing can refuse writes; the tab still switches for this visit.
    }
  }

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
    {/* The client picker sits above both views: switching client is the thing this page
        is asked to do most, and it must not reset which view you were working in. */}
    <div className="toolbar">
      <select className="input max-w-full sm:max-w-xs" value={clientId} onChange={(event) => setChosenClientId(event.target.value)}>
        {clients.map((client) => <option key={client.id} value={client.id}>{client.businessName}</option>)}
      </select>
      {!readOnly && <div className="tabs-scroll">
        <div className="segmented">
          <button type="button" className={view === "todo" ? "active" : ""} onClick={() => chooseTab("todo")}>
            <ListTodo size={15} /> To-do list
          </button>
          <button type="button" className={view === "calendar" ? "active" : ""} onClick={() => chooseTab("calendar")}>
            <CalendarDays size={15} /> Calendar
          </button>
        </div>
      </div>}
    </div>

    {view === "todo" && <ContentTodo clientId={clientId} clientName={activeClient?.businessName} />}

    {view === "calendar" && <>
      <div className="toolbar">
        <div className="flex flex-wrap items-center gap-2">
          <button className="icon-button" onClick={() => changeMonth(-1)} aria-label="Previous month"><ChevronLeft size={17} /></button>
          <span className="month-pill">{monthLabel(month, year)}</span>
          <button className="icon-button" onClick={() => changeMonth(1)} aria-label="Next month"><ChevronRight size={17} /></button>
        </div>
        {!readOnly && <div className="flex flex-wrap items-center gap-2">
          <button className="secondary-button" onClick={bulkGenerate} disabled={busy || !clientId}>
            <CalendarPlus size={15} /> {busy ? "Adding..." : "Fill month"}
          </button>
          <button className="primary" onClick={() => setEditing({ platform: "INSTAGRAM", postType: "STATIC", status: "DRAFT" })}>
            <Plus size={16} /> Add post
          </button>
        </div>}
      </div>

      <QueryState query={query} label="content plan">
        <>
          {/* A 7-column grid of 30 boxes is unreadable at 375px, so phones get a
              chronological list and the grid appears from tablet width up. */}
          <div className="space-y-3 lg:hidden">
            {/* The month grid is the desktop answer to "what is going out on the 26th".
                On a phone the same question is answered as a dated list. */}
            {taskDays.size > 0 && <div className="panel">
              <h2 className="section-title">To-dos this month</h2>
              <div className="mt-3 space-y-2">
                {[...taskDays.keys()].sort((a, b) => a - b).map((day) => <div key={day} className="calendar-task-day">
                  <span className="calendar-task-date">{shortDate(new Date(year, month - 1, day))}</span>
                  <div className="calendar-task-list">
                    {taskDays.get(day).map((task) => <span
                      key={task.id}
                      className={`calendar-task ${task.type.toLowerCase()} ${task.isDone ? "done" : ""}`}
                    >
                      <strong>{taskTypeLabel(task.type)}</strong> {task.title}
                    </span>)}
                  </div>
                </div>)}
              </div>
            </div>}

            {items.length === 0 && <p className="empty-state">No posts planned for {monthLabel(month, year)}.</p>}
            {items.map((item) => <div key={item.id}>
              <PostCard
                post={item}
                client={activeClient}
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
                    {/* Rendered as text, not a button: the calendar shows what is due on a
                        day, and a to-do is edited and ticked off on the To-do list tab. */}
                    {cell.tasks.map((task) => <span
                      key={task.id}
                      title={task.title}
                      className={`calendar-chip task ${task.type.toLowerCase()} ${task.isDone ? "done" : ""}`}
                    >{taskTypeLabel(task.type)} · {task.title}</span>)}
                  </div>
                </>}
              </div>)}
            </div>
          </div>
        </>
      </QueryState>
    </>}

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
function buildMonthGrid(month, year, items, taskDays) {
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
      }),
      tasks: taskDays.get(day) || []
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
