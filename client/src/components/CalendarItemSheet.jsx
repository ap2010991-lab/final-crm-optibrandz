import { useState } from "react";
import { CalendarDays, Check, Pencil, Trash2 } from "lucide-react";
import Modal from "./Modal";
import { fromDateInput, longDate, toDateInput } from "../lib/format";

/**
 * Move one thing on the content calendar to another day, or take it off the plan.
 *
 * Opened by tapping any chip, and from the day sheet. Dragging a chip onto another date
 * does the same move on a desktop, but the chips are hidden on a phone and a drag is not
 * a gesture anyone wants to attempt on a seventh of a 375px screen — so this is the way
 * the move is actually made most of the time, and the only way to remove something
 * without leaving the calendar.
 *
 * The page owns both actions rather than this sheet: a post and a to-do live behind
 * different routes, and this must not have to know which.
 */
export default function CalendarItemSheet({ entry, onMove, onDelete, onEdit, onClose }) {
  const original = toDateInput(entry.date);
  const [date, setDate] = useState(original);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  const moved = Boolean(date) && date !== original;

  // Shifts whatever is currently in the box rather than the saved date, so tapping
  // "+1 week" twice moves a fortnight — which is what the second tap looks like it does.
  function shift(days) {
    const from = date ? new Date(`${date}T12:00:00`) : new Date();
    from.setDate(from.getDate() + days);
    setDate(toDateInput(from));
    setError("");
  }

  async function run(action, work) {
    setBusy(action);
    setError("");
    try {
      await work();
      onClose();
    } catch (err) {
      setError(err?.message || "That did not work. Please try again.");
      setBusy("");
    }
  }

  return <Modal title={entry.kind === "post" ? "Scheduled post" : "To-do"} onClose={onClose}>
    <div className="space-y-4">
      <div className="item-sheet-head">
        <p className="item-sheet-title">{entry.title}</p>
        <div className="item-sheet-meta">
          <span className="day-post-status">{entry.state}</span>
          <span>{entry.date ? longDate(entry.date) : "No date yet"}</span>
        </div>
        {entry.detail && <p className="todo-notes">{entry.detail}</p>}
      </div>

      <div>
        <h3 className="section-title">Move to another day</h3>
        <div className="todo-add-row mt-2">
          <label className="todo-add-date">
            <CalendarDays size={15} />
            <input
              type="date"
              className="input"
              value={date}
              aria-label="New date"
              onChange={(event) => { setDate(event.target.value); setError(""); }}
            />
          </label>
          <button
            type="button"
            className="primary"
            disabled={!moved || Boolean(busy)}
            onClick={() => run("move", () => onMove(fromDateInput(date)))}
          >
            <Check size={16} /> {busy === "move" ? "Moving..." : "Move"}
          </button>
        </div>
        <div className="option-grid mt-2">
          <button type="button" className="option-pill" onClick={() => shift(1)}>+1 day</button>
          <button type="button" className="option-pill" onClick={() => shift(7)}>+1 week</button>
          <button type="button" className="option-pill" onClick={() => shift(-1)}>-1 day</button>
          <button type="button" className="option-pill" onClick={() => setDate(toDateInput(new Date()))}>Today</button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {/* Two steps rather than a second sheet on top of this one: removing something is
          worth a deliberate tap, but not a whole extra dialog to read and dismiss. */}
      <div className="modal-actions">
        {onEdit && <button type="button" className="secondary-button" onClick={onEdit} disabled={Boolean(busy)}>
          <Pencil size={15} /> Edit details
        </button>}
        {!confirming && <button type="button" className="danger-button" onClick={() => setConfirming(true)} disabled={Boolean(busy)}>
          <Trash2 size={16} /> Remove from calendar
        </button>}
        {confirming && <>
          <button type="button" className="secondary-button" onClick={() => setConfirming(false)} disabled={Boolean(busy)}>
            Keep it
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={Boolean(busy)}
            onClick={() => run("delete", onDelete)}
          >
            <Trash2 size={16} /> {busy === "delete" ? "Removing..." : "Yes, remove it"}
          </button>
        </>}
      </div>
    </div>
  </Modal>;
}
