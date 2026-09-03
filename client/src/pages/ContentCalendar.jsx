import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, ListTodo, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { monthLabel, pretty, shortDate, toDateInput } from "../lib/format";
import { QueryState } from "../components/QueryState";
import RecordModal, { ConfirmModal } from "../components/RecordModal";
import { CONTENT_STAGES } from "../lib/contentStages";
import { tasksByDay, taskTypeLabel } from "../lib/contentTasks";
import { findEntry, postEntry, taskEntry } from "../lib/calendarEntries";
import PostCard from "../components/PostCard";
import ContentTodo from "../components/ContentTodo";
import ContentDayModal from "../components/ContentDayModal";
import CalendarItemSheet from "../components/CalendarItemSheet";
import { useContentTasks } from "../lib/useContentTasks";
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
  const [openDay, setOpenDay] = useState(null);
  // The one chip whose date or existence is being changed. Holds the flattened shape from
  // calendarEntries, so the sheet does not care whether it came from a post or a to-do.
  const [acting, setActing] = useState(null);

  // A plain click must still open the sheet, so a drag only begins after the pointer has
  // actually travelled. Touch needs its own hold delay or iOS reads the gesture as a
  // scroll and the chip never leaves the cell.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  // Not /clients: the content plan is shared with colleagues who have no business
  // reading contract values, so this asks only for the names it puts in the picker.
  const clientsQuery = useQuery({ queryKey: ["client-options"], queryFn: () => api("/client-options") });
  const clients = useMemo(() => clientsQuery.data?.data || [], [clientsQuery.data]);
  // Falling back to the first client keeps the picker and the query in step without an
  // effect that writes state during render.
  const clientId = chosenClientId || clients[0]?.id || "";
  const activeClient = useMemo(() => clients.find((entry) => entry.id === clientId), [clients, clientId]);

  const calendarKey = useMemo(() => ["calendar", clientId, month, year], [clientId, month, year]);
  const query = useQuery({
    queryKey: calendarKey,
    queryFn: () => api(`/calendar?clientId=${encodeURIComponent(clientId)}&month=${month}&year=${year}`),
    enabled: Boolean(clientId) && view === "calendar"
  });
  const items = useMemo(() => query.data?.data || [], [query.data]);

  // Shared with the To-do tab, so ticking a task off there is reflected here without a
  // second round trip. Disabled for the client portal: the agency's work list is not
  // something a client should be shown, so it is never even requested.
  const { tasks, patch: patchTask, remove: removeTask } = useContentTasks(clientId, { enabled: view === "calendar" && !readOnly });
  const taskDays = useMemo(() => tasksByDay(tasks, month, year), [tasks, month, year]);

  const grid = useMemo(() => buildMonthGrid(month, year, items, taskDays), [month, year, items, taskDays]);
  const openCell = openDay ? grid.find((cell) => cell && cell.day === openDay) : null;

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
    setOpenDay(null);
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

  // The grid is the only place a post's date is visible, so a chip dragged to the 12th has
  // to be on the 12th before the request comes back — otherwise the drag looks like it
  // was refused. A real refusal puts the month back exactly as it was and re-throws, so
  // whichever sheet asked can say why.
  async function patchPost(post, changes) {
    const previous = queryClient.getQueryData(calendarKey);
    queryClient.setQueryData(calendarKey, (current) => current && {
      ...current,
      data: current.data.map((entry) => entry.id === post.id ? { ...entry, ...changes } : entry)
    });

    try {
      await api(`/calendar/${post.id}`, { method: "PUT", body: JSON.stringify(changes) });
      refresh();
    } catch (error) {
      queryClient.setQueryData(calendarKey, previous);
      throw error;
    }
  }

  async function deletePost(post) {
    const previous = queryClient.getQueryData(calendarKey);
    queryClient.setQueryData(calendarKey, (current) => current && {
      ...current,
      data: current.data.filter((entry) => entry.id !== post.id)
    });

    try {
      await api(`/calendar/${post.id}`, { method: "DELETE" });
      refresh();
    } catch (error) {
      queryClient.setQueryData(calendarKey, previous);
      throw error;
    }
  }

  // month and year are not decoration on a post: they record which plan it belongs to and
  // are what "Fill month" counts against, so a post moved into October has to stop being
  // one of September's twenty-six.
  function moveEntry(entry, iso) {
    if (entry.kind === "task") return patchTask(entry.record, { dueDate: iso });
    const date = new Date(iso);
    return patchPost(entry.record, {
      scheduledDate: iso,
      month: date.getMonth() + 1,
      year: date.getFullYear()
    });
  }

  const deleteEntry = (entry) => entry.kind === "task"
    ? removeTask(entry.record)
    : deletePost(entry.record);

  // Dropping a chip on a day has no sheet to report into, so the toast carries both the
  // confirmation and the failure.
  async function dropOnDay(dragId, day) {
    const entry = findEntry(dragId, items, tasks);
    if (!entry) return;
    const iso = new Date(year, month - 1, day, 12).toISOString();
    if (toDateInput(entry.date) === toDateInput(iso)) return;
    try {
      await moveEntry(entry, iso);
      notify(`Moved to ${shortDate(iso)}.`);
    } catch (error) {
      notify(error.message, "error");
    }
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
          {/* One grid at every width. Under 1024px each cell is just the date and a count,
              which is the only thing that fits in a seventh of a 375px screen; the chips
              appear from there up. Either way the date opens the day sheet. */}
          <div className="panel">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="section-title">{monthLabel(month, year)}</h2>
              {/* The chips only exist from 1024px up, so only that width is told to drag
                  them. A phone gets the sentence that matches what it can actually see. */}
              {!readOnly && <span className="text-xs font-semibold text-zinc-500">
                <span className="lg:hidden">Tap a date to add to it, or to move and remove what is on it.</span>
                <span className="hidden lg:inline">Tap a date to add to it. Drag a chip to another day to move it, or tap the chip to move or remove it.</span>
              </span>}
            </div>

            <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-black uppercase text-zinc-400">
              {WEEKDAYS.map((day) => <div key={day}>{day}</div>)}
            </div>
            {/* Dragging a chip onto a date is the gesture a calendar owes you, and it is
                the whole feature on a desktop. The chips are hidden below 1024px, so a
                phone never starts a drag and moves things through the sheet instead. */}
            <DndContext
              sensors={sensors}
              onDragEnd={(event) => {
                const day = Number(String(event.over?.id || "").replace("day-", ""));
                if (event.active?.id && day) dropOnDay(event.active.id, day);
              }}
            >
              <div className="mt-1 grid grid-cols-7 gap-1 lg:gap-2">
                {grid.map((cell, index) => cell
                  ? <DayCell
                    key={cell.day}
                    cell={cell}
                    month={month}
                    year={year}
                    readOnly={readOnly}
                    onOpenDay={setOpenDay}
                    onPick={setActing}
                  />
                  : <div key={`pad-${index}`} className="calendar-cell empty" />)}
              </div>
            </DndContext>
          </div>

          {/* The grid carries the dates; the cards below carry the creatives, which only
              phones need since the chips already show them from 1024px up. */}
          <div className="space-y-3 lg:hidden">
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
                <button className="table-action" onClick={() => setActing(postEntry(item))}>
                  <CalendarDays size={14} /> Move
                </button>
                <button className="danger-action" onClick={() => setDeleting(item)}><Trash2 size={14} /> Remove</button>
              </div>}
            </div>)}
          </div>
        </>
      </QueryState>
    </>}

    {openCell && <ContentDayModal
      date={new Date(year, month - 1, openCell.day)}
      clientId={clientId}
      clientName={activeClient?.businessName}
      posts={openCell.items}
      onPick={setActing}
      onClose={() => setOpenDay(null)}
    />}

    {/* Rendered after the day sheet so it lands on top when one is opened from the other;
        both backdrops share a z-index and DOM order settles it. */}
    {acting && !readOnly && <CalendarItemSheet
      entry={acting}
      onMove={(iso) => moveEntry(acting, iso)}
      onDelete={() => deleteEntry(acting)}
      onEdit={acting.kind === "post"
        ? () => {
          setEditing({ ...acting.record, scheduledDate: toDateInput(acting.record.scheduledDate) });
          setActing(null);
        }
        : null}
      onClose={() => setActing(null)}
    />}

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
      onConfirm={() => deletePost(deleting)}
      onClose={() => setDeleting(null)}
    />}
  </div>;
}

/**
 * One date on the grid, and the drop target for anything dragged onto it.
 *
 * The whole cell accepts the drop rather than the date button inside it, so a chip
 * released anywhere over the box lands on that day.
 */
function DayCell({ cell, month, year, readOnly, onOpenDay, onPick }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${cell.day}`, disabled: readOnly });
  const count = cell.items.length + cell.tasks.length;

  return <div ref={setNodeRef} className={`calendar-cell ${isOver ? "is-drop-target" : ""}`}>
    <button
      type="button"
      className={`calendar-day ${isToday(cell.day, month, year) ? "is-today" : ""}`}
      onClick={() => !readOnly && onOpenDay(cell.day)}
      disabled={readOnly}
      aria-label={`${cell.day} ${monthLabel(month, year)}, ${count} planned`}
    >
      <span className="calendar-day-number">{cell.day}</span>
      {count > 0 && <span className="calendar-day-count">{count}</span>}
    </button>

    <div className="calendar-cell-items">
      {cell.items.map((item) => <CalendarChip
        key={item.id}
        entry={postEntry(item)}
        tone={item.status.toLowerCase()}
        readOnly={readOnly}
        onPick={onPick}
      >{pretty(item.platform).slice(0, 4)} · {pretty(item.postType).slice(0, 6)}</CalendarChip>)}
      {/* To-dos used to be inert text here, on the reasoning that the calendar reports
          what is due and the To-do tab is where it is changed. That left the one screen
          showing a reel on the wrong day with no way to fix it, so they drag and open
          the same sheet as a post. Ticking one off is still the day sheet's job. */}
      {cell.tasks.map((task) => <CalendarChip
        key={task.id}
        entry={taskEntry(task)}
        tone={`task ${task.type.toLowerCase()} ${task.isDone ? "done" : ""}`}
        readOnly={readOnly}
        onPick={onPick}
      >{taskTypeLabel(task.type)} · {task.title}</CalendarChip>)}
    </div>
  </div>;
}

/**
 * One post or to-do on a date.
 *
 * Both a drag handle and a button: the pointer sensor waits 6px before it calls the
 * gesture a drag, so a plain tap still falls through to onClick and opens the sheet.
 */
function CalendarChip({ entry, tone, readOnly, onPick, children }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: entry.dragId,
    disabled: readOnly
  });

  return <button
    ref={setNodeRef}
    type="button"
    title={entry.title}
    className={`calendar-chip ${tone} ${isDragging ? "is-dragging" : ""}`}
    style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
    disabled={readOnly}
    onClick={() => onPick(entry)}
    {...listeners}
    {...attributes}
  >{children}</button>;
}

const isToday = (day, month, year) => {
  const now = new Date();
  return now.getDate() === day && now.getMonth() === month - 1 && now.getFullYear() === year;
};

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
