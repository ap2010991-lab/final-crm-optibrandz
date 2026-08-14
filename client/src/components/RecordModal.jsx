import { useState } from "react";
import { Save, Trash2 } from "lucide-react";
import Modal from "./Modal";
import Field from "./Field";
import { fromDateInput, splitList } from "../lib/format";

/**
 * Generic add/edit form. Each field declares its `kind`, and the payload is built from
 * those declarations — the old version special-cased two field names to fake invoice
 * line items, which silently dropped anything else.
 */
export default function RecordModal({ title, initial = {}, fields, onSubmit, onClose, note, submitLabel = "Save" }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function buildPayload() {
    const payload = {};
    fields.forEach((field) => {
      const raw = form[field.name];
      if (field.readOnly) return;
      switch (field.kind) {
        case "money":
        case "number":
          payload[field.name] = raw === "" || raw === undefined || raw === null ? 0 : Number(raw);
          break;
        case "int":
          payload[field.name] = raw === "" || raw === undefined || raw === null ? 0 : Math.round(Number(raw));
          break;
        case "multi":
          payload[field.name] = Array.isArray(raw) ? raw : splitList(raw);
          break;
        case "list":
          payload[field.name] = Array.isArray(raw) ? raw : splitList(raw);
          break;
        case "date":
          payload[field.name] = fromDateInput(raw);
          break;
        default:
          payload[field.name] = typeof raw === "string" ? raw.trim() : raw;
      }
    });
    return payload;
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    const payload = buildPayload();
    const missing = fields.find((field) => field.required && !String(payload[field.name] ?? "").trim());
    if (missing) {
      setError(`${missing.label} is required.`);
      return;
    }
    if (fields.some((field) => field.kind === "money" && Number(payload[field.name]) < 0)) {
      setError("Amounts cannot be negative.");
      return;
    }

    setSaving(true);
    try {
      await onSubmit(payload);
      onClose();
    } catch (err) {
      setError(err?.message || "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return <Modal title={title} onClose={onClose}>
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      {note && <div className="form-note md:col-span-2"><strong>{note.title}</strong><span>{note.body}</span></div>}
      {fields.map((field) => <Field
        key={field.name}
        {...field}
        value={form[field.name]}
        onChange={(value) => setForm((current) => ({ ...current, [field.name]: value }))}
      />)}
      {error && <div className="form-error md:col-span-2">{error}</div>}
      <div className="modal-actions md:col-span-2">
        <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="primary" disabled={saving}><Save size={16} /> {saving ? "Saving..." : submitLabel}</button>
      </div>
    </form>
  </Modal>;
}

export function ConfirmModal({ title, message, confirmLabel = "Delete", busyLabel = "Deleting...", onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err?.message || "That did not work. Please try again.");
      setBusy(false);
    }
  }

  return <Modal title={title} onClose={onClose}>
    <div className="space-y-4">
      <p className="text-sm font-semibold leading-6 text-zinc-600">{message}</p>
      {error && <div className="form-error">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="danger-button" onClick={confirm} disabled={busy}>
          <Trash2 size={16} /> {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </div>
  </Modal>;
}
