import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { api, useAuth, PUBLIC_BASE } from "../lib/api";
import { longDate, money, monthLabel, pretty } from "../lib/format";
import { QueryState } from "../components/QueryState";
import Badge from "../components/Badge";
import Invoices from "./Invoices";
import ContentCalendar from "./ContentCalendar";

/**
 * The client portal previously rendered the full agency Invoices and Content screens,
 * which handed clients "Create invoice", "Record payment", "Delete" and "Fill month"
 * buttons. Both are now mounted read-only.
 */
export default function Portal() {
  const { user } = useAuth();
  const reportsQuery = useQuery({ queryKey: ["reports", "portal"], queryFn: () => api("/reports"), retry: false });
  const reports = reportsQuery.data?.data || [];

  return <div className="space-y-5">
    <section className="hero-panel">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ffd84d]">Client portal</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight">Welcome back, {user?.name?.split(" ")[0] || "there"}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
        Your invoices, content plan and monthly reports, all in one place.
      </p>
    </section>

    <div className="panel">
      <h2 className="section-title">Your monthly reports</h2>
      <QueryState query={reportsQuery} label="reports">
        <div className="mt-3 space-y-3">
          {reports.length === 0 && <p className="empty-state">No reports published yet.</p>}
          {reports.map((report) => <div key={report.id} className="record-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-black">{monthLabel(report.month, report.year)}</h3>
                <p className="text-xs font-bold text-zinc-500">Published {longDate(report.createdAt)}</p>
              </div>
              <a className="table-action" href={`${PUBLIC_BASE}/api/public/reports/${report.id}/pdf`} target="_blank" rel="noopener noreferrer">
                <FileText size={14} /> PDF
              </a>
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-700">{report.summary}</p>
          </div>)}
        </div>
      </QueryState>
    </div>

    <Invoices readOnly />
    <div className="panel">
      <h2 className="section-title">Your content plan</h2>
      <div className="mt-3"><ContentCalendar readOnly /></div>
    </div>
  </div>;
}

export function PortalInvoiceStatus({ invoice }) {
  return <div className="flex items-center justify-between gap-2">
    <span>{money(invoice.totalAmount)}</span>
    <Badge tone={invoice.status}>{pretty(invoice.status)}</Badge>
  </div>;
}
