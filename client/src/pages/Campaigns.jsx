import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Edit3, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { money, monthLabel, pretty } from "../lib/format";
import { QueryState } from "../components/QueryState";
import RecordModal, { ConfirmModal } from "../components/RecordModal";
import DataTable from "../components/DataTable";
import { useToast } from "../lib/useToast";

const PLATFORMS = ["GOOGLE_ADS", "META_ADS", "INSTAGRAM", "FACEBOOK", "LINKEDIN", "YOUTUBE", "GMB"];

export default function Campaigns() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const today = new Date();

  // Every campaign used to be saved with month 5 / year 2026 hard-coded, so results
  // piled into one fictional month no matter when they were recorded.
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const query = useQuery({
    queryKey: ["campaigns", month, year],
    queryFn: () => api(`/campaigns?month=${month}&year=${year}`)
  });
  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: () => api("/clients") });
  const campaigns = query.data?.data || [];
  const clientOptions = (clientsQuery.data?.data || []).map((client) => ({ value: client.id, label: client.businessName }));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  function changeMonth(delta) {
    const next = new Date(year, month - 1 + delta, 1);
    setMonth(next.getMonth() + 1);
    setYear(next.getFullYear());
  }

  async function saveCampaign(payload) {
    const spend = Number(payload.adSpend || 0);
    const leads = Number(payload.leadsGenerated || 0);
    const clicks = Number(payload.clicks || 0);
    const impressions = Number(payload.impressions || 0);
    const body = {
      ...payload,
      month,
      year,
      // CTR and cost per lead are arithmetic, so they are derived rather than typed in
      // by hand and left to drift.
      ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
      cpl: leads > 0 ? Math.round((spend / leads) * 100) / 100 : 0
    };
    await api(editing?.id ? `/campaigns/${editing.id}` : "/campaigns", {
      method: editing?.id ? "PUT" : "POST",
      body: JSON.stringify(body)
    });
    notify(editing?.id ? "Campaign updated." : "Campaign added.");
    refresh();
  }

  const fields = [
    { name: "clientId", label: "Client", options: clientOptions, required: true },
    { name: "platform", label: "Platform", options: PLATFORMS, required: true },
    { name: "adSpend", label: "Ad spend", kind: "money" },
    { name: "impressions", label: "Impressions", kind: "int" },
    { name: "clicks", label: "Clicks", kind: "int" },
    { name: "leadsGenerated", label: "Leads generated", kind: "int" },
    { name: "notes", label: "Notes", rows: 2 }
  ];

  return <div className="space-y-4">
    <div className="toolbar">
      <div className="flex flex-wrap items-center gap-2">
        <button className="icon-button" onClick={() => changeMonth(-1)} aria-label="Previous month"><ChevronLeft size={17} /></button>
        <span className="month-pill">{monthLabel(month, year)}</span>
        <button className="icon-button" onClick={() => changeMonth(1)} aria-label="Next month"><ChevronRight size={17} /></button>
      </div>
      <button className="primary" disabled={!clientOptions.length}
        onClick={() => setEditing({ clientId: clientOptions[0]?.value, platform: "META_ADS", adSpend: 0, impressions: 0, clicks: 0, leadsGenerated: 0 })}>
        <Plus size={16} /> Add results
      </button>
    </div>

    <div className="panel">
      <QueryState query={query} label="campaign results">
        <DataTable
          rows={campaigns}
          columns={["platform", "adSpend", "impressions", "clicks", { key: "ctr", label: "CTR %" }, "leadsGenerated", { key: "cpl", label: "Cost / lead" }]}
          title={(row) => pretty(row.platform)}
          emptyMessage={`No campaign results logged for ${monthLabel(month, year)}.`}
          action={(row) => <div className="flex flex-wrap gap-2">
            <button className="table-action" onClick={() => setEditing(row)}><Edit3 size={14} /> Edit</button>
            <button className="danger-action" onClick={() => setDeleting(row)}><Trash2 size={14} /> Delete</button>
          </div>}
        />
      </QueryState>

      {campaigns.length > 0 && <div className="totals-box mt-4">
        <div><span>Total ad spend</span><strong>{money(campaigns.reduce((sum, item) => sum + Number(item.adSpend || 0), 0))}</strong></div>
        <div><span>Total leads</span><strong>{campaigns.reduce((sum, item) => sum + Number(item.leadsGenerated || 0), 0)}</strong></div>
        <div className="total"><span>Blended cost per lead</span><strong>{money(blendedCpl(campaigns))}</strong></div>
      </div>}
    </div>

    {editing && <RecordModal
      title={editing.id ? "Edit campaign results" : `Add results · ${monthLabel(month, year)}`}
      initial={editing}
      fields={fields}
      onSubmit={saveCampaign}
      onClose={() => setEditing(null)}
    />}
    {deleting && <ConfirmModal
      title="Delete campaign results"
      message={`Delete the ${pretty(deleting.platform)} results for ${monthLabel(month, year)}?`}
      confirmLabel="Delete results"
      onConfirm={async () => {
        await api(`/campaigns/${deleting.id}`, { method: "DELETE" });
        notify("Campaign results deleted.");
        refresh();
      }}
      onClose={() => setDeleting(null)}
    />}
  </div>;
}

function blendedCpl(campaigns) {
  const spend = campaigns.reduce((sum, item) => sum + Number(item.adSpend || 0), 0);
  const leads = campaigns.reduce((sum, item) => sum + Number(item.leadsGenerated || 0), 0);
  return leads > 0 ? Math.round((spend / leads) * 100) / 100 : 0;
}
