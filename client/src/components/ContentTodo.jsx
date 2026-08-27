import { useMemo, useRef, useState } from "react";
import { CalendarDays, Check, Eraser, ListTodo, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import { firstName, fromDateInput, shortDate, toDateInput } from "../lib/format";
import { isOverdue, startOfToday, TASK_TYPES, taskTypeLabel } from "../lib/contentTasks";
import { useContentTasks } from "../lib/useContentTasks";
import { QueryState } from "./QueryState";
import RecordModal, { ConfirmModal } from "./RecordModal";
import { useToast } from "../lib/useToast";

/**
 * One client's list of reels and posts still to make.
 *
 * The Content calendar next to this plans dates, platforms and creatives. This answers the
 * shorter question asked twenty times a day — "what is left to shoot for this client?" —
 * so a task is a line of text you tick, and a ticked one stays on screen with a line
 * through it rather than vanishing.
 */

export default function ContentTodo({ clientId, clientName }) {
  const { notify } = useToast();
  const titleRef = useRef(null);

  const [draftType, setDraftType] = useState("REEL");
  const [draftTitle, setDraftTitle] = useState("");
  // Kept after each add rather than cleared: a planning session is usually "everything
  // going out on the 26th", so re-picking the same date per post would be busywork.
  const [draftDate, setDraftDate] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [showDone, setShowDone] = useState(true);

  const { query, tasks, toggle, add, refresh } = useContentTasks(clientId);

  const pending = useMemo(() => tasks.filter((task) => !task.isDone), [tasks]);
  const done = useMemo(() => tasks.filter((task) => task.isDone), [tasks]);
  const percent = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;

  async function addTask(event) {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    try {
      await add({ title, type: draftType, dueDate: fromDateInput(draftDate) });
      setDraftTitle("");
      // A month's plan gets typed in one sitting, so the caret stays where it was.
      titleRef.current?.focus();
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setAdding(false);
    }
  }

  async function saveTask(payload) {
    await api(`/content-tasks/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
    notify("Task updated.");
    refresh();
  }

  async function removeTask(task) {
    await api(`/content-tasks/${task.id}`, { method: "DELETE" });
    notify("Task removed.");
    refresh();
  }

  async function clearDone() {
    await api("/content-tasks/clear-done", { method: "POST", body: JSON.stringify({ clientId }) });
    notify(`${done.length} finished task${done.length === 1 ? "" : "s"} cleared.`);
    refresh();
  }

  const fields = [
    { name: "title", label: "Task", required: true, wide: true, placeholder: "e.g. Diwali offer reel" },
    { name: "type", label: "Kind", options: TASK_TYPES, required: true },
    { name: "dueDate", label: "Date it goes out", kind: "date", type: "date" },
    { name: "notes", label: "Notes", rows: 3, placeholder: "Script idea, reference link, who is shooting it" }
  ];

  const today = startOfToday();

  const row = (task) => {
    const overdue = isOverdue(task, today);
    return <li key={task.id} className={`todo-row ${task.isDone ? "done" : ""}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={task.isDone}
        aria-label={task.isDone ? `Mark "${task.title}" as still to do` : `Mark "${task.title}" as done`}
        className="todo-check"
        onClick={() => toggle(task)}
      >
        {task.isDone && <Check size={14} strokeWidth={3.5} />}
      </button>

      <div className="todo-body">
        <p className="todo-title">{task.title}</p>
        <div className="todo-meta">
          <span className={`todo-type ${task.type.toLowerCase()}`}>{taskTypeLabel(task.type)}</span>
          {task.dueDate && !task.isDone && <span className={overdue ? "todo-overdue" : ""}>
            {overdue ? `Overdue ${shortDate(task.dueDate)}` : shortDate(task.dueDate)}
          </span>}
          {/* On a list four people share, the useful facts are who asked for a job and
              who actually got it out. Tasks from before the list was shared have neither
              recorded, so both are shown only when there is a name. */}
          {task.isDone && task.completedAt && <span>
            Posted {shortDate(task.completedAt)}{firstName(task.completedBy) && ` by ${firstName(task.completedBy)}`}
          </span>}
          {!task.isDone && firstName(task.createdBy) && <span>Added by {firstName(task.createdBy)}</span>}
        </div>
        {task.notes && <p className="todo-notes">{task.notes}</p>}
      </div>

      <div className="todo-actions">
        <button
          type="button"
          className="icon-button"
          aria-label={`Edit "${task.title}"`}
          onClick={() => setEditing({ ...task, dueDate: toDateInput(task.dueDate), notes: task.notes || "" })}
        ><Pencil size={15} /></button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Remove "${task.title}"`}
          onClick={() => setDeleting(task)}
        ><Trash2 size={15} /></button>
      </div>
    </li>;
  };

  return <div className="space-y-4">
    <form className="panel todo-add" onSubmit={addTask}>
      <div className="option-grid">
        {TASK_TYPES.map((type) => <button
          type="button"
          key={type.value}
          aria-pressed={draftType === type.value}
          className={`option-pill ${draftType === type.value ? "selected" : ""}`}
          onClick={() => setDraftType(type.value)}
        >{type.label}</button>)}
      </div>
      <input
        ref={titleRef}
        className="input"
        value={draftTitle}
        maxLength={200}
        placeholder={`New ${taskTypeLabel(draftType).toLowerCase()} for ${clientName || "this client"}`}
        onChange={(event) => setDraftTitle(event.target.value)}
      />
      {/* The date is its own row so a 375px phone never squeezes the title field down to
          a few characters. Leaving it blank is fine — the task simply has no date yet and
          stays off the calendar until it gets one. */}
      <div className="todo-add-row">
        <label className="todo-add-date">
          <CalendarDays size={15} />
          <input
            type="date"
            className="input"
            value={draftDate}
            aria-label="Date this goes out"
            onChange={(event) => setDraftDate(event.target.value)}
          />
          {draftDate && <button
            type="button"
            className="todo-add-date-clear"
            aria-label="Clear the date"
            onClick={() => setDraftDate("")}
          ><X size={14} /></button>}
        </label>
        <button className="primary" disabled={adding || !draftTitle.trim()}>
          <Plus size={16} /> {adding ? "Adding..." : "Add"}
        </button>
      </div>
    </form>

    <QueryState query={query} label="to-do list">
      <>
        {tasks.length > 0 && <div className="panel todo-progress">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="section-title">{pending.length} still to do</h2>
            <span className="text-xs font-bold text-zinc-500">{done.length} of {tasks.length} done</span>
          </div>
          <div className="todo-progress-track"><span style={{ width: `${percent}%` }} /></div>
        </div>}

        {tasks.length === 0 && <div className="empty-state">
          <ListTodo size={22} className="mx-auto text-[#ff7a18]" />
          <h3>Nothing on the list for {clientName || "this client"}</h3>
          <p>Add the reels and posts you owe them above. Tick each one off once it is made and uploaded.</p>
        </div>}

        {pending.length > 0 && <ul className="todo-list">{pending.map(row)}</ul>}

        {done.length > 0 && <div className="space-y-3">
          <div className="toolbar-inline">
            <button type="button" className="table-action" onClick={() => setShowDone((value) => !value)} aria-expanded={showDone}>
              {showDone ? "Hide" : "Show"} {done.length} completed
            </button>
            {showDone && <button type="button" className="danger-action" onClick={() => setClearing(true)}>
              <Eraser size={14} /> Clear completed
            </button>}
          </div>
          {showDone && <ul className="todo-list">{done.map(row)}</ul>}
        </div>}
      </>
    </QueryState>

    {editing && <RecordModal
      title="Edit task"
      initial={editing}
      fields={fields}
      onSubmit={saveTask}
      onClose={() => setEditing(null)}
    />}
    {deleting && <ConfirmModal
      title="Remove task"
      message={`Remove "${deleting.title}" from this client's list?`}
      confirmLabel="Remove task"
      onConfirm={() => removeTask(deleting)}
      onClose={() => setDeleting(null)}
    />}
    {clearing && <ConfirmModal
      title="Clear completed"
      message={`Permanently remove ${done.length} completed task${done.length === 1 ? "" : "s"} for ${clientName || "this client"}? The pending ones stay.`}
      confirmLabel="Clear completed"
      busyLabel="Clearing..."
      onConfirm={clearDone}
      onClose={() => setClearing(false)}
    />}
  </div>;
}
