import { useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import Modal from "./Modal";
import { longDate, pretty, shortDate } from "../lib/format";
import { TASK_TYPES, taskTypeLabel } from "../lib/contentTasks";
import { useContentTasks } from "../lib/useContentTasks";
import { useToast } from "../lib/useToast";

/**
 * What is happening on one date, and the fastest way to add to it.
 *
 * Reached by tapping a date on the content calendar. Planning a month is done a day at a
 * time — "the 26th gets a reel, a story and the offer post" — so the date is fixed by
 * where you tapped and never has to be typed.
 */
export default function ContentDayModal({ date, clientId, clientName, posts = [], onClose, readOnly = false }) {
  const { notify } = useToast();
  const titleRef = useRef(null);
  const [type, setType] = useState("REEL");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const { tasks, toggle, add } = useContentTasks(clientId);

  // The sheet is opened from a grid already holding the whole month, so the day's tasks
  // are filtered from that cache rather than fetched again.
  const dayTasks = tasks.filter((task) => {
    if (!task.dueDate) return false;
    const due = new Date(task.dueDate);
    return due.getDate() === date.getDate()
      && due.getMonth() === date.getMonth()
      && due.getFullYear() === date.getFullYear();
  });

  async function submit(event) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      // Midday local, matching every other date-only value in the CRM, so the task cannot
      // land on the neighbouring day for a viewer in another timezone.
      const dueDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).toISOString();
      await add({ title: trimmed, type, dueDate });
      setTitle("");
      // Adding three things to one day is the normal case, so the form stays open and
      // focused rather than closing the sheet after each one.
      titleRef.current?.focus();
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  const pending = dayTasks.filter((task) => !task.isDone).length;

  return <Modal title={longDate(date)} onClose={onClose}>
    <div className="space-y-4">
      <p className="text-xs font-bold text-zinc-500">
        {clientName}
        {dayTasks.length > 0 && ` · ${pending} to do, ${dayTasks.length - pending} done`}
      </p>

      {!readOnly && <form className="day-add" onSubmit={submit}>
        <div className="option-grid">
          {TASK_TYPES.map((option) => <button
            type="button"
            key={option.value}
            aria-pressed={type === option.value}
            className={`option-pill ${type === option.value ? "selected" : ""}`}
            onClick={() => setType(option.value)}
          >{option.label}</button>)}
        </div>
        <div className="todo-add-row">
          <input
            ref={titleRef}
            className="input"
            value={title}
            maxLength={200}
            placeholder={`New ${taskTypeLabel(type).toLowerCase()} for ${shortDate(date)}`}
            onChange={(event) => setTitle(event.target.value)}
          />
          <button className="primary" disabled={busy || !title.trim()}>
            <Plus size={16} /> {busy ? "Adding..." : "Add"}
          </button>
        </div>
      </form>}

      {dayTasks.length > 0 && <div>
        <h3 className="section-title">To-dos on this day</h3>
        <ul className="todo-list mt-2">
          {dayTasks.map((task) => <li key={task.id} className={`todo-row ${task.isDone ? "done" : ""}`}>
            <button
              type="button"
              role="checkbox"
              aria-checked={task.isDone}
              aria-label={task.isDone ? `Mark "${task.title}" as still to do` : `Mark "${task.title}" as done`}
              className="todo-check"
              disabled={readOnly}
              onClick={() => toggle(task)}
            >
              {task.isDone && <Check size={14} strokeWidth={3.5} />}
            </button>
            <div className="todo-body">
              <p className="todo-title">{task.title}</p>
              <div className="todo-meta">
                <span className={`todo-type ${task.type.toLowerCase()}`}>{taskTypeLabel(task.type)}</span>
                {task.isDone && task.completedAt && <span>Posted {shortDate(task.completedAt)}</span>}
              </div>
            </div>
          </li>)}
        </ul>
      </div>}

      {posts.length > 0 && <div>
        <h3 className="section-title">Scheduled posts</h3>
        <ul className="day-post-list mt-2">
          {posts.map((post) => <li key={post.id}>
            <span>{pretty(post.platform)} · {pretty(post.postType)}</span>
            <span className="day-post-status">{pretty(post.status)}</span>
          </li>)}
        </ul>
      </div>}

      {dayTasks.length === 0 && posts.length === 0 && <p className="empty-state">
        Nothing planned for this day yet.
      </p>}
    </div>
  </Modal>;
}
