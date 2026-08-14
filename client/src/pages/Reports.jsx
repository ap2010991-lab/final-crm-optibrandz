import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2 } from "lucide-react";
import { api, PUBLIC_BASE } from "../lib/api";
import { longDate, monthLabel } from "../lib/format";
import { QueryState } from "../components/QueryState";
import { ConfirmModal } from "../components/RecordModal";
import { useToast } from "../lib/useToast";

export default function Reports() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const now = new Date();
  const [chosenClientId, setChosenClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: () => api("/clients") });
  const clients = useMemo(() => clientsQuery.data?.data || [], [clientsQuery.data]);
  // The dropdown showed the first client while the list below quietly fetched every
  // client's reports, so the two never agreed. One derived value now drives both.
  const clientId = chosenClientId || clients[0]?.id || "";

  const query = useQuery({
    queryKey: ["reports", clientId],
    queryFn: () => api(`/reports?clientId=${encodeURIComponent(clientId)}`),
    enabled: Boolean(clientId)
  });
  const reports = query.data?.data || [];

  async function generateReport() {
    if (!clientId) return;
    setBusy(true);
    try {
      await api("/reports/generate", {
        method: "POST",
        body: JSON.stringify({ clientId, month: now.getMonth() + 1, year: now.getFullYear() })
      });
      notify("Report generated.");
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (clientsQuery.isSuccess && !clients.length) {
    return <div className="empty-state"><h3>No clients yet</h3><p>Add a client before generating a monthly report.</p></div>;
  }

  return <div className="space-y-4">
    <div className="toolbar">
      <select className="input max-w-full sm:max-w-xs" value={clientId} onChange={(event) => setChosenClientId(event.target.value)}>
        {clients.map((client) => <option key={client.id} value={client.id}>{client.businessName}</option>)}
      </select>
      <button className="primary" onClick={generateReport} disabled={!clientId || busy}>
        <FileText size={16} /> {busy ? "Generating..." : `Generate ${monthLabel(now.getMonth() + 1, now.getFullYear())}`}
      </button>
    </div>

    <QueryState query={query} label="reports">
      <div className="space-y-3">
        {reports.length === 0 && <p className="empty-state">No reports generated for this client yet.</p>}
        {reports.map((report) => <div key={report.id} className="panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-black">{monthLabel(report.month, report.year)}</h3>
              <p className="text-xs font-bold text-zinc-500">
                {report.client?.businessName} · created {longDate(report.createdAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a className="table-action" href={`${PUBLIC_BASE}/api/reports/${report.id}/pdf`} target="_blank" rel="noopener noreferrer">
                <FileText size={14} /> PDF
              </a>
              <button className="danger-action" onClick={() => setDeleting(report)}><Trash2 size={14} /> Delete</button>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-zinc-700">{report.summary}</p>
        </div>)}
      </div>
    </QueryState>

    {deleting && <ConfirmModal
      title="Delete report"
      message={`Delete the ${monthLabel(deleting.month, deleting.year)} report?`}
      confirmLabel="Delete report"
      onConfirm={async () => {
        await api(`/reports/${deleting.id}`, { method: "DELETE" });
        notify("Report deleted.");
        queryClient.invalidateQueries({ queryKey: ["reports"] });
      }}
      onClose={() => setDeleting(null)}
    />}
  </div>;
}
