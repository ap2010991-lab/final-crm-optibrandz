import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { NotebookPen, Plus, Share2, Users } from "lucide-react";
import { firstName, longDate } from "../lib/format";
import { QueryState } from "../components/QueryState";
import Modal from "../components/Modal";
import RecordModal, { ConfirmModal } from "../components/RecordModal";
import NoteCard from "../components/NoteCard";
import NoteShareModal from "../components/NoteShareModal";
import { useNotes } from "../lib/useNotes";
import { useToast } from "../lib/useToast";

// Which tab this device opens on. Most people live in their own notes; whoever mainly
// reads what colleagues send them switches once and it stays.
const TAB_KEY = "ob_notes_tab";
const readStoredTab = () => {
  try {
    return localStorage.getItem(TAB_KEY) === "shared" ? "shared" : "mine";
  } catch {
    return "mine";
  }
};

const FIELDS = [
  { name: "title", label: "Title", required: true, wide: true, placeholder: "e.g. Diwali shoot plan" },
  { name: "body", label: "Note", rows: 10, placeholder: "Anything you need to remember. Nobody sees this unless you share it." }
];

export default function Notes() {
  const { notify } = useToast();
  const [params, setParams] = useSearchParams();

  const [chosenTab, setChosenTab] = useState(readStoredTab);
  const [editing, setEditing] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [picked, setPicked] = useState(null);

  const { query, mine, shared, create, update, remove, setShares } = useNotes();

  // The bell links to /notes?open=<id>, so a note shared with you opens from the
  // notification rather than leaving you to hunt for it.
  //
  // Both the open note and the tab behind it are derived from the URL rather than copied
  // into state by an effect. An effect would have to keep two sources of truth in step and
  // would fight the user the moment they closed the note or changed tab; this way closing
  // it clears the parameter and everything follows from that one change.
  const openId = params.get("open");
  const fromLink = useMemo(
    () => (openId ? [...mine, ...shared].find((note) => note.id === openId) : null),
    [mine, shared, openId]
  );
  const reading = picked || fromLink;
  const tab = fromLink && shared.some((note) => note.id === openId) ? "shared" : chosenTab;

  function closeReading() {
    setPicked(null);
    if (openId) setParams({}, { replace: true });
  }

  function chooseTab(next) {
    setChosenTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // Private browsing can refuse writes; the tab still switches for this visit.
    }
  }

  async function saveNote(payload) {
    if (editing?.id) await update(editing, payload);
    else await create(payload);
    notify(editing?.id ? "Note saved." : "Note added.");
  }

  async function deleteNote(note) {
    await remove(note);
    notify("Note deleted.");
  }

  async function saveShares(userIds) {
    await setShares(sharing, userIds);
    notify(userIds.length
      ? `Shared with ${userIds.length} ${userIds.length === 1 ? "person" : "people"}.`
      : "This note is private again.");
  }

  const list = tab === "mine" ? mine : shared;

  return <div className="space-y-4">
    <div className="toolbar">
      <div className="tabs-scroll">
        <div className="segmented">
          <button type="button" className={tab === "mine" ? "active" : ""} onClick={() => chooseTab("mine")}>
            <NotebookPen size={15} /> My notes
          </button>
          <button type="button" className={tab === "shared" ? "active" : ""} onClick={() => chooseTab("shared")}>
            <Users size={15} /> Shared with me{shared.length > 0 && ` (${shared.length})`}
          </button>
        </div>
      </div>
      {tab === "mine" && <button className="primary" onClick={() => setEditing({ title: "", body: "" })}>
        <Plus size={16} /> New note
      </button>}
    </div>

    <QueryState query={query} label="notes">
      <>
        {tab === "mine" && mine.length === 0 && <div className="empty-state">
          <NotebookPen size={22} className="mx-auto text-[#ff7a18]" />
          <h3>Nothing written down yet</h3>
          {/* Says out loud which list this is, so nobody has to work out why the CRM has
              two places to write down something to do. */}
          <p>
            Notes are yours. The Content to-do list is what the agency owes a client —
            this is what you owe yourself. Share one with a teammate when you want them to see it.
          </p>
        </div>}

        {tab === "shared" && shared.length === 0 && <div className="empty-state">
          <Share2 size={22} className="mx-auto text-[#ff7a18]" />
          <h3>Nothing shared with you</h3>
          <p>When a colleague shares one of their notes, it appears here to read.</p>
        </div>}

        {list.length > 0 && <div className="note-grid">
          {list.map((note) => <NoteCard
            key={note.id}
            note={note}
            readOnly={tab === "shared"}
            onOpen={setPicked}
            onEdit={setEditing}
            onShare={setSharing}
            onDelete={setDeleting}
          />)}
        </div>}
      </>
    </QueryState>

    {reading && <Modal title={reading.title} onClose={closeReading}>
      <div className="space-y-3">
        <p className="text-xs font-bold text-zinc-500">
          {reading.owner
            ? `From ${firstName(reading.owner)} · shared ${longDate(reading.sharedAt)}`
            : `Updated ${longDate(reading.updatedAt)}`}
        </p>
        {/* pre-wrap, not markup: this is somebody's private writing and never HTML. */}
        {reading.body?.trim()
          ? <p className="note-read-body">{reading.body}</p>
          : <p className="empty-state">This note has a title and nothing else yet.</p>}
      </div>
    </Modal>}

    {editing && <RecordModal
      title={editing.id ? "Edit note" : "New note"}
      initial={editing}
      fields={FIELDS}
      onSubmit={saveNote}
      onClose={() => setEditing(null)}
    />}

    {sharing && <NoteShareModal
      note={sharing}
      onSave={saveShares}
      onClose={() => setSharing(null)}
    />}

    {deleting && <ConfirmModal
      title="Delete note"
      message={`Delete “${deleting.title}”? Anyone it was shared with loses it too.`}
      confirmLabel="Delete note"
      onConfirm={() => deleteNote(deleting)}
      onClose={() => setDeleting(null)}
    />}
  </div>;
}
