import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, MessageCircle, Phone, Plus, Search, Trash2 } from "lucide-react";
import { api, useAuth } from "../lib/api";
import { balanceDue, initials, money, normalizePhone, pretty, toDateInput } from "../lib/format";
import { QueryState } from "../components/QueryState";
import RecordModal, { ConfirmModal } from "../components/RecordModal";
import Badge from "../components/Badge";
import { useToast } from "../lib/useToast";
import { clientFields } from "../lib/recordFields";


export default function Clients() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [term, setTerm] = useState("");

  const query = useQuery({ queryKey: ["clients"], queryFn: () => api("/clients") });
  const clients = query.data?.data || [];
  const canDelete = user?.role === "OWNER";

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["clients"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["services"] });
  };

  async function saveClient(payload) {
    if (Number(payload.advancePaid || 0) > Number(payload.totalValue || 0)) {
      throw new Error("Advance received cannot be more than the total deal value.");
    }
    await api(editing?.id ? `/clients/${editing.id}` : "/clients", {
      method: editing?.id ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    notify(editing?.id ? "Client updated." : "Client added.");
    refresh();
  }

  async function deleteClient(client) {
    await api(`/clients/${client.id}`, { method: "DELETE" });
    notify(`${client.businessName} deleted.`);
    refresh();
  }

  const filtered = term.trim()
    ? clients.filter((client) => `${client.businessName} ${client.city} ${client.industry}`.toLowerCase().includes(term.trim().toLowerCase()))
    : clients;

  return <div className="space-y-4">
    <div className="toolbar">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={17} />
        <input className="input pl-10" type="search" placeholder="Filter clients" value={term}
          onChange={(event) => setTerm(event.target.value)} />
      </div>
      <button className="primary" onClick={() => setEditing({ status: "ACTIVE", healthScore: 100, services: [], mrr: 0, totalValue: 0, advancePaid: 0 })}>
        <Plus size={16} /> Add client
      </button>
    </div>

    <QueryState query={query} label="clients">
      {clients.length === 0
        ? <div className="empty-state">
            <h3>No clients yet</h3>
            <p>Add a client, or convert a lead from the Leads board.</p>
          </div>
        : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((client) => {
              const phone = normalizePhone(client.phone);
              return <div key={client.id} className="panel">
                <Link to={`/clients/${client.id}`} className="block">
                  <div className="flex items-start gap-3">
                    <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-sm font-black text-white">
                      {initials(client.businessName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-black">{client.businessName}</h3>
                      <p className="truncate text-sm text-slate-500">
                        {[client.city, client.industry].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <Badge tone={client.status}>{pretty(client.status)}</Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1">
                    {(client.services || []).map((item) => <span className="chip" key={item}>{pretty(item)}</span>)}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <Info label="MRR" value={money(client.mrr)} />
                    <Info label="Balance due" value={money(client.balanceDue ?? balanceDue(client))} />
                    <Info label="Advance" value={money(client.advancePaid)} />
                    <Info label="Health" value={`${client.healthScore ?? 0}%`} />
                  </div>
                </Link>

                <div className="record-card-actions">
                  {phone && <a className="whatsapp-action" href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer">
                    <MessageCircle size={14} /> WhatsApp
                  </a>}
                  {phone && <a className="table-action" href={`tel:+${phone}`}><Phone size={14} /> Call</a>}
                  <button className="table-action" onClick={() => setEditing({
                    ...client,
                    renewalDate: toDateInput(client.renewalDate)
                  })}><Edit3 size={14} /> Edit</button>
                  {canDelete && <button className="danger-action" onClick={() => setDeleting(client)}><Trash2 size={14} /> Delete</button>}
                </div>
              </div>;
            })}
            {filtered.length === 0 && <p className="empty-state md:col-span-2 xl:col-span-3">No clients match &ldquo;{term}&rdquo;.</p>}
          </div>}
    </QueryState>

    {editing && <RecordModal
      title={editing.id ? "Edit client" : "Add client"}
      initial={editing}
      fields={clientFields}
      onSubmit={saveClient}
      onClose={() => setEditing(null)}
    />}
    {deleting && <ConfirmModal
      title="Delete client"
      message={`Delete ${deleting.businessName}? This also removes their services, tasks, invoices, campaigns, content and activity. This cannot be undone.`}
      confirmLabel="Delete client"
      onConfirm={() => deleteClient(deleting)}
      onClose={() => setDeleting(null)}
    />}
  </div>;
}

function Info({ label, value }) {
  return <div>
    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
    <div className="mt-0.5 text-sm font-black text-slate-800">{value}</div>
  </div>;
}
