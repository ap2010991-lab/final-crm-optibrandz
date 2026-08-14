import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { Edit3, GripVertical, MessageCircle, Phone, Plus, Trash2 } from "lucide-react";
import { api, useAuth } from "../lib/api";
import { money, normalizePhone, pretty, shortDate, toDateInput } from "../lib/format";
import { QueryState } from "../components/QueryState";
import RecordModal, { ConfirmModal } from "../components/RecordModal";
import Badge from "../components/Badge";
import { useToast } from "../lib/useToast";
import { LEAD_STAGES, leadFields } from "../lib/recordFields";


export default function Leads() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [stageFilter, setStageFilter] = useState("");

  const query = useQuery({ queryKey: ["leads"], queryFn: () => api("/leads") });
  const leads = query.data?.data || [];
  const canDelete = ["OWNER", "ACCOUNT_MANAGER"].includes(user?.role);

  // Touch needs its own sensor with a short hold before the drag starts, otherwise iOS
  // treats the gesture as a page scroll and cards never move.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  async function moveLead(id, status) {
    const lead = leads.find((item) => item.id === id);
    if (!lead || lead.status === status) return;
    try {
      await api(`/leads/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
      notify(`${lead.name} moved to ${pretty(status)}.`);
      refresh();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function saveLead(payload) {
    await api(editing?.id ? `/leads/${editing.id}` : "/leads", {
      method: editing?.id ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    notify(editing?.id ? "Lead updated." : "Lead added.");
    refresh();
  }

  async function deleteLead(lead) {
    await api(`/leads/${lead.id}`, { method: "DELETE" });
    notify(`${lead.name} deleted.`);
    refresh();
  }

  const filtered = stageFilter ? leads.filter((lead) => lead.status === stageFilter) : leads;

  return <div className="space-y-4">
    <div className="toolbar">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <select className="input max-w-[190px]" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
          <option value="">All stages ({leads.length})</option>
          {LEAD_STAGES.map((stage) => <option key={stage} value={stage}>
            {pretty(stage)} ({leads.filter((lead) => lead.status === stage).length})
          </option>)}
        </select>
      </div>
      <button className="primary" onClick={() => setEditing({ source: "WHATSAPP", status: "NEW", serviceInterest: [] })}>
        <Plus size={16} /> Add lead
      </button>
    </div>

    <QueryState query={query} label="leads">
      {leads.length === 0
        ? <div className="empty-state">
            <h3>No leads yet</h3>
            <p>Add your first enquiry and it will show up on the board and in today&rsquo;s action centre.</p>
            <button className="primary mt-4" onClick={() => setEditing({ source: "WHATSAPP", status: "NEW", serviceInterest: [] })}>
              <Plus size={16} /> Add lead
            </button>
          </div>
        : <>
            {/* Phones get a stacked list with a stage picker; dragging a card sideways on a
                375px screen was never workable. The board stays for desktop. */}
            <div className="space-y-3 lg:hidden">
              {filtered.map((lead) => <LeadRow key={lead.id} lead={lead} onMove={moveLead}
                onEdit={() => setEditing({ ...lead, followUpDate: toDateInput(lead.followUpDate) })}
                onDelete={canDelete ? () => setDeleting(lead) : null} />)}
              {filtered.length === 0 && <p className="empty-state">No leads in this stage.</p>}
            </div>

            <div className="hidden lg:block">
              <DndContext sensors={sensors} onDragEnd={(event) => {
                if (event.over?.id && event.active?.id) moveLead(event.active.id, event.over.id);
              }}>
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {LEAD_STAGES.map((stage) => <Column key={stage} id={stage} count={leads.filter((lead) => lead.status === stage).length}>
                    {leads.filter((lead) => lead.status === stage).map((lead) => <LeadCard
                      key={lead.id}
                      lead={lead}
                      onEdit={() => setEditing({ ...lead, followUpDate: toDateInput(lead.followUpDate) })}
                      onDelete={canDelete ? () => setDeleting(lead) : null}
                    />)}
                  </Column>)}
                </div>
              </DndContext>
            </div>
          </>}
    </QueryState>

    {editing && <RecordModal
      title={editing.id ? "Edit lead" : "Add lead"}
      initial={editing}
      fields={leadFields}
      onSubmit={saveLead}
      onClose={() => setEditing(null)}
    />}
    {deleting && <ConfirmModal
      title="Delete lead"
      message={`Delete ${deleting.name}? This removes the lead and its activity history. This cannot be undone.`}
      confirmLabel="Delete lead"
      onConfirm={() => deleteLead(deleting)}
      onClose={() => setDeleting(null)}
    />}
  </div>;
}

function LeadRow({ lead, onMove, onEdit, onDelete }) {
  const phone = normalizePhone(lead.phone);
  return <div className="record-card">
    <div className="flex items-start justify-between gap-3">
      <Link to={`/leads/${lead.id}`} className="min-w-0 flex-1">
        <div className="truncate font-black">{lead.name}</div>
        <div className="truncate text-sm font-semibold text-zinc-500">{lead.businessName || lead.city || "—"}</div>
      </Link>
      <Badge tone={lead.status}>{pretty(lead.status)}</Badge>
    </div>

    <div className="mt-3 flex flex-wrap gap-1">
      {(lead.serviceInterest || []).map((item) => <span key={item} className="chip">{pretty(item)}</span>)}
    </div>

    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-bold text-zinc-500">
      <span>Score {lead.score ?? 0}</span>
      {lead.budget && <span>Budget {money(lead.budget)}</span>}
      <span>Follow up {shortDate(lead.followUpDate)}</span>
    </div>

    <label className="mt-3 block">
      <span className="field-label">Move to stage</span>
      <select className="input" value={lead.status} onChange={(event) => onMove(lead.id, event.target.value)}>
        {LEAD_STAGES.map((stage) => <option key={stage} value={stage}>{pretty(stage)}</option>)}
      </select>
    </label>

    <div className="record-card-actions">
      {phone && <a className="whatsapp-action" href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer">
        <MessageCircle size={14} /> WhatsApp
      </a>}
      {phone && <a className="table-action" href={`tel:+${phone}`}><Phone size={14} /> Call</a>}
      <button className="table-action" onClick={onEdit}><Edit3 size={14} /> Edit</button>
      {onDelete && <button className="danger-action" onClick={onDelete}><Trash2 size={14} /> Delete</button>}
    </div>
  </div>;
}

function Column({ id, count, children }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={`kanban-column ${isOver ? "over" : ""}`}>
    <h3 className="mb-3 flex items-center justify-between text-sm font-black">
      {pretty(id)}<span className="text-xs text-zinc-400">{count}</span>
    </h3>
    <div className="space-y-3">{children}</div>
  </div>;
}

function LeadCard({ lead, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  return <div
    ref={setNodeRef}
    style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, opacity: isDragging ? 0.6 : 1 }}
    className="kanban-card"
  >
    <div className="flex items-start gap-2">
      <Link to={`/leads/${lead.id}`} className="min-w-0 flex-1">
        <div className="truncate font-semibold">{lead.name}</div>
        <div className="truncate text-sm text-slate-500">{lead.businessName}</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {(lead.serviceInterest || []).map((item) => <span key={item} className="chip">{pretty(item)}</span>)}
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
          <span>{pretty(lead.source)}</span><span>{shortDate(lead.followUpDate)}</span>
        </div>
      </Link>
      <button type="button" className="drag-handle" aria-label={`Drag ${lead.name}`} {...listeners} {...attributes}>
        <GripVertical size={16} />
      </button>
    </div>
    <div className="mt-3 flex gap-2">
      <button className="table-action" onClick={onEdit}><Edit3 size={13} /> Edit</button>
      {onDelete && <button className="danger-action" onClick={onDelete}><Trash2 size={13} /> Delete</button>}
    </div>
  </div>;
}
