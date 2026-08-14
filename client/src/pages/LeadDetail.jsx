import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Edit3, MessageCircle, Phone, Send, Trash2 } from "lucide-react";
import { api, useAuth } from "../lib/api";
import { money, normalizePhone, pretty, shortDate, toDateInput } from "../lib/format";
import { QueryState } from "../components/QueryState";
import RecordModal, { ConfirmModal } from "../components/RecordModal";
import Badge from "../components/Badge";
import { useToast } from "../lib/useToast";
import { leadFields } from "../lib/recordFields";

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const query = useQuery({ queryKey: ["lead", id], queryFn: () => api(`/leads/${id}`) });
  const lead = query.data?.data;
  const canConvert = ["OWNER", "ACCOUNT_MANAGER"].includes(user?.role);

  const refresh = () => {
    query.refetch();
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  async function convert() {
    setBusy(true);
    try {
      const result = await api(`/leads/${id}/convert`, { method: "POST" });
      notify(result.alreadyConverted ? "This lead was already converted — opening the client." : "Lead converted to a client.");
      navigate(`/clients/${result.data.id}`);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function logActivity() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await api(`/leads/${id}/activity`, { method: "POST", body: JSON.stringify({ type: "NOTE", note: note.trim() }) });
      setNote("");
      notify("Note added.");
      refresh();
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveLead(payload) {
    await api(`/leads/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    notify("Lead updated.");
    refresh();
  }

  async function deleteLead() {
    await api(`/leads/${id}`, { method: "DELETE" });
    notify("Lead deleted.");
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    navigate("/leads");
  }

  return <QueryState query={query} label="lead">
    {lead && <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <aside className="panel h-fit">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-black">{lead.businessName || lead.name}</h2>
          <Badge tone={lead.status}>{pretty(lead.status)}</Badge>
        </div>
        <div className="mt-4 space-y-3">
          <Info label="Contact" value={lead.name} />
          <Info label="Phone" value={lead.phone} />
          <Info label="Email" value={lead.email} />
          <Info label="City" value={lead.city} />
          <Info label="Source" value={pretty(lead.source)} />
          <Info label="Interested in" value={(lead.serviceInterest || []).map(pretty).join(", ")} />
          <Info label="Budget" value={lead.budget ? money(lead.budget) : null} />
          <Info label="Score" value={lead.score} />
          <Info label="Follow up" value={shortDate(lead.followUpDate)} />
          {lead.notes && <Info label="Notes" value={lead.notes} />}
        </div>

        <div className="mt-5 grid gap-2">
          {normalizePhone(lead.phone) && <>
            <a className="whatsapp-button" href={`https://wa.me/${normalizePhone(lead.phone)}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={16} /> WhatsApp
            </a>
            <a className="secondary-button" href={`tel:+${normalizePhone(lead.phone)}`}><Phone size={16} /> Call</a>
          </>}
          <button className="secondary-button" onClick={() => setEditing(true)}><Edit3 size={16} /> Edit lead</button>
          {canConvert && lead.status !== "CONVERTED" && <button className="primary" onClick={convert} disabled={busy}>
            <ArrowRight size={16} /> Convert to client
          </button>}
          {canConvert && <button className="danger-button" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Delete lead</button>}
        </div>
      </aside>

      <section className="panel">
        <h2 className="section-title">Activity timeline</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input className="input" value={note} onChange={(event) => setNote(event.target.value)}
            placeholder="Log a call, WhatsApp or note"
            onKeyDown={(event) => { if (event.key === "Enter") logActivity(); }} />
          <button className="primary shrink-0" onClick={logActivity} disabled={busy || !note.trim()}><Send size={16} /> Log</button>
        </div>
        <div className="mt-4 space-y-3">
          {(lead.activities || []).length === 0 && <p className="empty-state">No activity logged yet.</p>}
          {(lead.activities || []).map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <Badge tone={item.type}>{pretty(item.type)}</Badge>
              <span className="text-xs text-slate-500">{shortDate(item.createdAt)}</span>
            </div>
            <p className="mt-2 break-words text-sm text-slate-600">{item.note}</p>
          </div>)}
        </div>
      </section>

      {editing && <RecordModal
        title="Edit lead"
        initial={{ ...lead, followUpDate: toDateInput(lead.followUpDate) }}
        fields={leadFields}
        onSubmit={saveLead}
        onClose={() => setEditing(false)}
      />}
      {confirmDelete && <ConfirmModal
        title="Delete lead"
        message={`Delete ${lead.name}? This removes the lead and its activity history. This cannot be undone.`}
        confirmLabel="Delete lead"
        onConfirm={deleteLead}
        onClose={() => setConfirmDelete(false)}
      />}
    </div>}
  </QueryState>;
}

function Info({ label, value }) {
  return <div>
    <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
    <div className="mt-0.5 break-words text-sm font-semibold text-slate-800">{value || "-"}</div>
  </div>;
}
