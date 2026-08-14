import { Suspense, lazy } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BriefcaseBusiness, CheckCircle2, ChevronRight, CircleDollarSign, FileText, Gauge, Megaphone, Plus } from "lucide-react";
import { api } from "../lib/api";
import { money, pretty, shortDate } from "../lib/format";
import { QueryState } from "../components/QueryState";
import Badge from "../components/Badge";

const DashboardCharts = lazy(() => import("../components/DashboardCharts"));

export default function Dashboard() {
  const query = useQuery({ queryKey: ["dashboard"], queryFn: () => api("/dashboard") });

  return <QueryState query={query} label="dashboard">
    <DashboardView d={query.data?.data || {}} />
  </QueryState>;
}

function DashboardView({ d }) {
  const cards = [
    ["Active clients", d.totalActiveClients ?? 0, BriefcaseBusiness],
    ["MRR", money(d.mrr), CircleDollarSign],
    ["Deal value", money(d.contractedValue), FileText],
    ["Advances", money(d.advanceReceived), CheckCircle2],
    ["Balance due", money(d.dealBalanceDue), CircleDollarSign],
    ["Outstanding", money(d.totalOutstanding), FileText],
    ["New leads", d.newLeadsThisWeek ?? 0, Megaphone],
    ["Collection", `${d.collectionRate || 0}%`, Gauge]
  ];

  return <div className="space-y-5">
    <section className="hero-panel">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ffd84d]">Optibrandz command centre</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight lg:text-3xl">Turn scrolls into sales, then keep every client moving.</h2>
      <div className="hero-score mt-5">
        <div><span>Monthly recurring revenue</span><strong>{money(d.mrr)}</strong></div>
        <div><span>Open collections</span><strong>{money(d.totalOutstanding)}</strong></div>
        <div><span>Lead conversion</span><strong>{d.conversionRate || 0}%</strong></div>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link className="primary" to="/leads"><Plus size={16} /> Add lead</Link>
        <Link className="secondary-action" to="/content">Review calendar</Link>
      </div>
    </section>

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {cards.map(([label, value, Icon]) => <div key={label} className="metric-card">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">{label}</span>
          <Icon size={16} className="shrink-0 text-[#ff7a18]" />
        </div>
        <div className="mt-2 text-xl font-black lg:text-2xl">{value}</div>
      </div>)}
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MiniStat label="Active services" value={d.activeServicesCount} detail="Live retainers and projects" />
      <MiniStat label="Content in review" value={d.contentInReview} detail="Posts waiting for approval" />
      <MiniStat label="Campaign leads" value={d.campaignLeads} detail="Leads from campaign reports" />
      <MiniStat label="Conversion rate" value={`${d.conversionRate || 0}%`} detail="Converted leads vs pipeline" />
    </div>

    <Suspense fallback={<div className="panel h-56 animate-pulse" />}>
      <DashboardCharts d={d} />
    </Suspense>

    <div className="grid gap-4 xl:grid-cols-3">
      <ListPanel title="Priority tasks" rows={d.priorityTasks} to="/services"
        render={(item) => <><span className="truncate">{item.title}</span><Badge tone={item.priority}>{pretty(item.priority)}</Badge></>} />
      <ListPanel title="Top campaigns" rows={d.topCampaigns} to="/campaigns"
        render={(item) => <><span>{pretty(item.platform)}</span><span className="text-xs font-black text-zinc-500">{item.leadsGenerated || 0} leads · CPL {money(item.cpl)}</span></>} />
      <ListPanel title="Recent invoices" rows={d.recentInvoices} to="/invoices"
        render={(item) => <><span>{item.invoiceNumber}</span><span className="text-xs font-black text-zinc-500">{money(item.totalAmount)} · {pretty(item.status)}</span></>} />
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <AlertPanel title="Renewals" count={d.renewalsDueSoon?.length}
        items={(d.renewalsDueSoon || []).map((client) => `${client.businessName} · ${shortDate(client.renewalDate)}`)} />
      <AlertPanel title="Overdue invoices" count={d.overdueInvoices?.length}
        items={(d.overdueInvoices || []).map((invoice) => `${invoice.invoiceNumber} · ${money(invoice.totalAmount)}`)} />
      <AlertPanel title="Overdue tasks" count={d.overdueTasksCount}
        items={d.overdueTasksCount ? ["Open the task board to clear them"] : []} />
      <AlertPanel title="Idle leads" count={d.idleLeadsCount}
        items={d.idleLeadsCount ? ["Follow up cold or missed leads"] : []} />
    </div>
  </div>;
}

function MiniStat({ label, value, detail }) {
  return <div className="mini-stat">
    <span>{label}</span>
    <strong>{value ?? 0}</strong>
    <p>{detail}</p>
  </div>;
}

function ListPanel({ title, rows = [], render, to }) {
  return <div className="panel">
    <div className="flex items-center justify-between gap-2">
      <h2 className="section-title">{title}</h2>
      {to && <Link to={to} className="panel-link">Open</Link>}
    </div>
    <div className="mt-3 space-y-2">
      {(rows || []).length
        ? rows.map((item, index) => <div key={item.id || item.invoiceNumber || item.platform || index} className="dashboard-list-row">{render(item)}</div>)
        : <div className="text-sm font-semibold text-zinc-500">No records yet</div>}
    </div>
  </div>;
}

function AlertPanel({ title, count = 0, items = [] }) {
  return <div className="panel">
    <div className="flex items-center justify-between">
      <h2 className="section-title">{title}</h2>
      <Badge tone={count ? "OVERDUE" : "DONE"}>{count || 0}</Badge>
    </div>
    <div className="mt-3 space-y-2">
      {(items.length ? items : ["All clear"]).map((item) => <div key={item} className="flex items-start gap-2 text-sm text-slate-600">
        <ChevronRight size={14} className="mt-1 shrink-0" /><span className="min-w-0 break-words">{item}</span>
      </div>)}
    </div>
  </div>;
}
