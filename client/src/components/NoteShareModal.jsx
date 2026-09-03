import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Save } from "lucide-react";
import Modal from "./Modal";
import { api } from "../lib/api";
import { initials, pretty } from "../lib/format";
import { QueryState } from "./QueryState";

/**
 * Who may read this note.
 *
 * Names are ticked, never typed. The list comes from /team-options, which is the people
 * the owner added through the Team page — so "only teammates the owner has added" is not a
 * rule this modal enforces, it is the only thing it is able to show.
 *
 * Ticking and unticking are saved together as one list, because that is the question being
 * answered: here is who can see it, as of now.
 */
export default function NoteShareModal({ note, onSave, onClose }) {
  const query = useQuery({ queryKey: ["team-options"], queryFn: () => api("/team-options") });
  const people = query.data?.data || [];

  const [chosen, setChosen] = useState(() => new Set((note.shares || []).map((share) => share.userId)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggle(id) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await onSave([...chosen]);
      onClose();
    } catch (err) {
      setError(err?.message || "Could not save who this is shared with.");
      setSaving(false);
    }
  }

  return <Modal title="Share this note" onClose={onClose}>
    <div className="space-y-4">
      <p className="text-xs font-bold text-zinc-500">
        “{note.title}” · they will be able to read it, not change it.
      </p>

      <QueryState query={query} label="team">
        {people.length === 0
          ? <p className="empty-state">Nobody else has been added to the team yet. Add a colleague on the Team page and you can share notes with them.</p>
          : <ul className="note-share-list">
            {people.map((person) => {
              const picked = chosen.has(person.id);
              return <li key={person.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={picked}
                  className={`note-share-row ${picked ? "picked" : ""}`}
                  onClick={() => toggle(person.id)}
                >
                  <span className="note-share-avatar">{initials(person.name)}</span>
                  <span className="note-share-body">
                    <span className="note-share-name">{person.name}</span>
                    <span className="note-share-role">{pretty(person.role)}</span>
                  </span>
                  <span className={`note-share-tick ${picked ? "on" : ""}`}>
                    {picked && <Check size={14} strokeWidth={3.5} />}
                  </span>
                </button>
              </li>;
            })}
          </ul>}
      </QueryState>

      {error && <div className="form-error">{error}</div>}

      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" className="primary" onClick={save} disabled={saving || query.isLoading}>
          <Save size={16} /> {saving ? "Saving..." : chosen.size ? `Share with ${chosen.size}` : "Keep it private"}
        </button>
      </div>
    </div>
  </Modal>;
}
