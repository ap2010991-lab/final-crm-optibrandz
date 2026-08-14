import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, MessageCircle, Phone } from "lucide-react";
import { api } from "../lib/api";
import { balanceDue, initials, money, normalizePhone, pretty, shortDate, toDateInput } from "../lib/format";
import { QueryState } from "../components/QueryState";
import RecordModal from "../components/RecordModal";
import DataTable from "../components/DataTable";
import Badge from "../components/Badge";
import { useToast } from "../lib/useToast";
import { clientFields } from "../lib/recordFields";

const TABS = ["Overview", "Services", "Invoices", "Campaigns", "Content", "Activity"];

export default function ClientDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [tab, setTab] = useState("Overview");
  const [editing, setEditing] = useState(false);

  const query = useQuery({ queryKey: ["client", id], queryFn: () => api(`/clients/${id}`) });
  const client = query.data?.data;

  async function saveClient(payload) {
    if (Number(payload.advancePaid || 0) > Number(payload.totalValue || 0)) {
      throw new Error("Advance received cannot be more than the total deal value.");
    }
    await api(`/clients/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    notify("Client updated.");
    query.refetch();
    queryClient.invalidateQueries({ queryKey: ["clients"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const phone = normalizePhone(client?.phone);

  return <QueryState query={query} label="client">
    {client && <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <aside className="panel h-fit">
        <div className="flex items-start gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-slate-900 text-sm font-black text-white">
            {initials(client.businessName)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-black">{client.businessName}</h2>
            <Badge tone={client.status}>{pretty(client.status)}</Badge>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <Info label="Contact" value={client.contactPerson} />
          <Info label="Phone" value={client.phone} />
          <Info label="Email" value={client.email} />
          <Info label="City" value={client.city} />
          <Info label="MRR" value={money(client.mrr)} />
          <Info label="Balance due" value={money(client.balanceDue ?? balanceDue(client))} />
          <Info label="Health" value={`${client.healthScore ?? 0}%`} />
          <Info label="Renewal" value={shortDate(client.renewalDate)} />
        </div>

        <div className="mt-5 grid gap-2">
          {phone && <>
            <a className="whatsapp-button" href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={16} /> WhatsApp
            </a>
            <a className="secondary-button" href={`tel:+${phone}`}><Phone size={16} /> Call</a>
          </>}
          <button className="secondary-button" onClick={() => setEditing(true)}><Edit3 size={16} /> Edit client</button>
        </div>
      </aside>

      <section className="panel min-w-0">
        <div className="tabs-scroll">
          <div className="tabs">
            {TABS.map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}
          </div>
        </div>

        {tab === "Overview" && <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Info label="Industry" value={client.industry} />
          <Info label="Website" value={client.websiteUrl} />
          <Info label="Monthly retainer" value={money(client.mrr)} />
          <Info label="Total deal value" value={money(client.totalValue)} />
          <Info label="Advance received" value={money(client.advancePaid)} />
          <Info label="Balance due" value={money(client.balanceDue ?? balanceDue(client))} />
        </div>}

        {tab === "Services" && <DataTable
          rows={client.services || []}
          columns={["serviceType", "packageName", "monthlyValue", "status"]}
          title={(row) => pretty(row.serviceType)}
          emptyMessage="No services added for this client yet."
        />}

        {tab === "Invoices" && <DataTable
          rows={client.invoices || []}
          columns={["invoiceNumber", "totalAmount", "paidAmount", "status", "dueDate"]}
          title={(row) => row.invoiceNumber}
          emptyMessage="No invoices raised for this client yet."
        />}

        {tab === "Campaigns" && <DataTable
          rows={client.campaigns || []}
          columns={["platform", "adSpend", "leadsGenerated", "ctr", "cpl"]}
          title={(row) => pretty(row.platform)}
          emptyMessage="No campaign results logged yet."
        />}

        {tab === "Content" && <DataTable
          rows={client.calendarItems || []}
          columns={["platform", "postType", "scheduledDate", "status"]}
          title={(row) => `${pretty(row.platform)} · ${pretty(row.postType)}`}
          emptyMessage="No content planned for this client yet."
        />}

        {tab === "Activity" && <div className="mt-4 space-y-3">
          {(client.activities || []).length === 0 && <p className="empty-state">No activity logged yet.</p>}
          {(client.activities || []).map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <Badge tone={item.type}>{pretty(item.type)}</Badge>
              <span className="text-xs text-slate-500">{shortDate(item.createdAt)}</span>
            </div>
            <p className="mt-2 break-words text-sm text-slate-600">{item.note}</p>
          </div>)}
        </div>}
      </section>

      {editing && <RecordModal
        title="Edit client"
        initial={{
          ...client,
          // The detail endpoint returns full service records; the form expects the list
          // of active service types.
          services: (client.services || []).filter((item) => item.status === "ACTIVE").map((item) => item.serviceType),
          renewalDate: toDateInput(client.renewalDate)
        }}
        fields={clientFields}
        onSubmit={saveClient}
        onClose={() => setEditing(false)}
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
