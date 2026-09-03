import { Eye, Pencil, Share2, Trash2, Users } from "lucide-react";
import { firstName, shortDate } from "../lib/format";

/**
 * One note in either list.
 *
 * The same card serves both tabs because they are the same object seen from two sides —
 * what differs is only what you may do with it. A note shared with you carries no Edit and
 * no Delete anywhere in the markup, rather than disabled buttons: a control you cannot use
 * is a promise the page keeps breaking.
 *
 * The body is rendered as text. It is somebody's private writing and it is never HTML.
 */
export default function NoteCard({ note, readOnly = false, onOpen, onEdit, onShare, onDelete }) {
  const readers = note.shares || [];

  return <article className="note-card">
    <button type="button" className="note-open" onClick={() => onOpen(note)}>
      <h3 className="note-title">{note.title}</h3>
      {note.body?.trim() && <p className="note-preview">{note.body}</p>}
    </button>

    <div className="note-meta">
      {readOnly
        ? <span className="note-from">
          <Users size={13} /> From {firstName(note.owner) || "a colleague"} · {shortDate(note.sharedAt)}
        </span>
        : <span>Updated {shortDate(note.updatedAt)}</span>}

      {/* Who can read this is the one fact about a private note worth putting on the card
          without being asked — it is the thing you would otherwise open it to check. */}
      {!readOnly && readers.length > 0 && <span className="note-shared-with">
        <Share2 size={13} /> {readers.map((share) => firstName(share.user)).join(", ")}
      </span>}
    </div>

    <div className="record-card-actions">
      {readOnly
        ? <button className="table-action" onClick={() => onOpen(note)}><Eye size={14} /> Read</button>
        : <>
          <button className="table-action" onClick={() => onEdit(note)}><Pencil size={14} /> Edit</button>
          <button className="table-action" onClick={() => onShare(note)}>
            <Share2 size={14} /> {readers.length ? `Shared with ${readers.length}` : "Share"}
          </button>
          <button className="danger-action" onClick={() => onDelete(note)}><Trash2 size={14} /> Delete</button>
        </>}
    </div>
  </article>;
}
