import { useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { create } from "zustand";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Bell, Bot, BriefcaseBusiness, CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign, ClipboardList, FileText, Gauge, ImageUp, LayoutDashboard, LogOut, Megaphone, Plus, Search, Send, Settings, Sparkles, UploadCloud, Users, Wand2 } from "lucide-react";
import optibrandzLogo from "./assets/optibrandz-logo.png";

const API_URL = import.meta.env.VITE_API_URL || (["localhost", "127.0.0.1"].includes(window.location.hostname) ? "http://localhost:3001/api" : "/api");
const queryClient = new QueryClient();

const useAuth = create((set, get) => ({
  token: localStorage.getItem("ob_token"),
  user: JSON.parse(localStorage.getItem("ob_user") || "null"),
  async login(email, password) {
    const response = await fetch(`${API_URL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }), credentials: "include" });
    if (!response.ok) throw new Error("Invalid login");
    const data = await response.json();
    localStorage.setItem("ob_token", data.token);
    localStorage.setItem("ob_user", JSON.stringify(data.user));
    set({ token: data.token, user: data.user });
  },
  logout() {
    localStorage.removeItem("ob_token");
    localStorage.removeItem("ob_user");
    set({ token: null, user: null });
  },
  headers() {
    return { Authorization: `Bearer ${get().token}` };
  }
}));

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...useAuth.getState().headers(), ...(options.headers || {}) },
    credentials: "include"
  });
  if (!response.ok) throw new Error((await response.json()).message || "Request failed");
  return response.json();
}

const nav = [
  ["Dashboard", "/dashboard", LayoutDashboard],
  ["AI Agent", "/ai", Bot],
  ["Leads", "/leads", Megaphone],
  ["Clients", "/clients", BriefcaseBusiness],
  ["Services", "/services", ClipboardList],
  ["Content", "/content", CalendarDays],
  ["Invoices", "/invoices", CircleDollarSign],
  ["Campaigns", "/campaigns", Sparkles],
  ["Team", "/team/workload", Users],
  ["Settings", "/settings", Settings]
];
const tones = {
  NEW: "bg-sky-100 text-sky-700 border-sky-200", CONTACTED: "bg-blue-100 text-blue-700 border-blue-200", DEMO_SCHEDULED: "bg-violet-100 text-violet-700 border-violet-200", PROPOSAL_SENT: "bg-amber-100 text-amber-800 border-amber-200", NEGOTIATION: "bg-orange-100 text-orange-800 border-orange-200", CONVERTED: "bg-emerald-100 text-emerald-700 border-emerald-200", LOST: "bg-rose-100 text-rose-700 border-rose-200", PAID: "bg-emerald-100 text-emerald-700 border-emerald-200", PARTIAL: "bg-blue-100 text-blue-700 border-blue-200", OVERDUE: "bg-rose-100 text-rose-700 border-rose-200", PENDING: "bg-amber-100 text-amber-800 border-amber-200", REVIEW: "bg-violet-100 text-violet-700 border-violet-200", DONE: "bg-emerald-100 text-emerald-700 border-emerald-200", ACTIVE: "bg-emerald-100 text-emerald-700 border-emerald-200", ONBOARDING: "bg-blue-100 text-blue-700 border-blue-200"
};
const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;
const date = (v) => v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-";
const pretty = (v) => String(v || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
function BrandLogo({ className = "size-11" }) { return <img src={optibrandzLogo} alt="Optibrandz logo" className={`${className} rounded-full bg-black object-contain p-1.5`} />; }
function Badge({ children, tone }) { return <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${tones[tone] || "border-slate-200 bg-slate-100 text-slate-700"}`}>{children}</span>; }

function Shell({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const title = nav.find((item) => location.pathname.startsWith(item[1].startsWith("/team") ? "/team" : item[1]))?.[0] || "OptiBrandz CRM";
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: () => api("/notifications"), enabled: Boolean(user) });
  const unread = data?.data?.filter((item) => !item.isRead).length || 0;
  return <div className="app-shell min-h-screen text-zinc-950">
    <aside className="brand-sidebar fixed inset-y-0 left-0 z-20 hidden w-68 border-r lg:block">
      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-5"><BrandLogo /><div><div className="font-semibold text-white">Optibrandz</div><div className="text-xs text-white/55">Agency growth CRM</div></div></div>
      <nav className="space-y-1 p-3">{nav.map(([label, href, Icon]) => <Link key={href} to={href} className={`sidebar-link ${location.pathname.startsWith(href.startsWith("/team") ? "/team" : href) ? "active" : ""}`}><Icon size={18} />{label}</Link>)}</nav>
      <div className="absolute bottom-0 w-full border-t border-white/10 p-4"><div className="user-strip flex items-center gap-3"><div className="grid size-9 place-items-center rounded-lg bg-[#ffd84d] text-sm font-black text-[#090909]">{user?.avatar || "AP"}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-white">{user?.name}</div><div className="truncate text-xs text-white/55">{pretty(user?.role)}</div></div><button className="dark-icon-button" onClick={logout} title="Logout"><LogOut size={16} /></button></div></div>
    </aside>
    <div className="lg:pl-68"><header className="topbar sticky top-0 z-10 flex h-20 items-center gap-3 border-b px-4 backdrop-blur lg:px-6"><div><h1 className="min-w-fit text-lg font-black tracking-tight">{title}</h1><p className="hidden text-xs font-semibold text-zinc-500 sm:block">Turning agency activity into sales, approvals, and renewals.</p></div><div className="relative max-w-xl flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 text-zinc-400" size={18} /><input className="h-10 w-full rounded-full border border-black/10 bg-white/80 pl-10 pr-3 text-sm outline-none focus:border-[#ff7a18] focus:ring-4 focus:ring-[#ff7a18]/15" placeholder="Search clients, leads, invoices" /></div><button className="icon-button relative" title="Notifications"><Bell size={18} />{unread > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[#ff7a18] text-[10px] font-black text-white">{unread}</span>}</button></header><main className="p-4 pb-24 lg:p-6">{children}</main></div>
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-black/10 bg-[#fff9ed]/95 p-1 backdrop-blur lg:hidden">{nav.slice(0, 5).map(([label, href, Icon]) => <Link key={href} to={href} className="flex flex-col items-center gap-1 rounded-md py-2 text-[11px] font-semibold text-zinc-700"><Icon size={18} />{label}</Link>)}</nav>
  </div>;
}

function RequireAuth({ children, roles }) {
  const { token, user } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <Shell>{children}</Shell>;
}

function Login({ portal = false }) {
  const [email, setEmail] = useState(portal ? "client@demo.in" : "alok@optibrandz.in");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const { login, user } = useAuth();
  const navigate = useNavigate();
  async function submit(event) {
    event.preventDefault();
    setError("");
    try { await login(email, password); navigate(portal || useAuth.getState().user?.role === "CLIENT" ? "/portal/dashboard" : "/dashboard"); } catch { setError("Email or password did not match."); }
  }
  if (user) return <Navigate to={user.role === "CLIENT" ? "/portal/dashboard" : "/dashboard"} replace />;
  return <div className="login-stage grid min-h-screen place-items-center px-4"><form onSubmit={submit} className="login-card w-full max-w-md rounded-2xl border border-white/10 bg-white p-8 shadow-2xl"><div className="mb-8 flex items-center gap-3"><BrandLogo className="size-14" /><div><h1 className="text-xl font-black">Optibrandz CRM</h1><p className="text-sm font-medium text-zinc-500">{portal ? "Client portal login" : "Agency operations login"}</p></div></div><label className="field-label">Email</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /><label className="field-label mt-4">Password</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />{error && <p className="mt-3 text-sm text-rose-600">{error}</p>}<button className="primary mt-6 h-11 w-full">Login</button></form></div>;
}

function Dashboard() {
  const { data } = useQuery({ queryKey: ["dashboard"], queryFn: () => api("/dashboard") });
  const d = data?.data;
  const cards = [["Active Clients", d?.totalActiveClients, BriefcaseBusiness], ["MRR", money(d?.mrr), CircleDollarSign], ["Outstanding", money(d?.totalOutstanding), FileText], ["New Leads", d?.newLeadsThisWeek, Megaphone], ["Conversion", `${d?.conversionRate || 0}%`, Gauge]];
  return <div className="space-y-5">
    <section className="hero-panel overflow-hidden rounded-2xl p-5 text-white shadow-2xl shadow-black/10 lg:p-6">
      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <div className="relative z-[1]">
          <div className="flex items-center gap-3"><BrandLogo className="size-14" /><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ffd84d]">Optibrandz command center</p><h2 className="mt-1 text-3xl font-black tracking-tight lg:text-4xl">Turn scrolls into sales, then keep every client moving.</h2></div></div>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-white/68">Lead follow-ups, monthly retainers, invoices, content approvals, renewals, and campaign reports are organized in one operating view for the Vapi growth team.</p>
          <div className="mt-6 flex flex-wrap gap-3"><Link className="primary" to="/leads"><Plus size={16} /> Add Lead</Link><Link className="secondary-action" to="/content">Review Calendar</Link></div>
        </div>
        <div className="hero-score grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <div><span>Monthly recurring revenue</span><strong>{money(d?.mrr)}</strong></div>
          <div><span>Open collections</span><strong>{money(d?.totalOutstanding)}</strong></div>
          <div><span>Conversion rhythm</span><strong>{d?.conversionRate || 0}%</strong></div>
        </div>
      </div>
    </section>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{cards.map(([label, value, Icon]) => <div key={label} className="metric-card"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-zinc-500">{label}</span><Icon size={18} className="text-[#ff7a18]" /></div><div className="mt-3 text-2xl font-black">{value || "0"}</div></div>)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.4fr_.9fr]"><div className="panel h-80 min-w-0"><h2 className="section-title">Revenue Trend</h2><ResponsiveContainer width="100%" height={250}><AreaChart data={d?.revenueChart || []}><CartesianGrid strokeDasharray="3 3" stroke="#e5e0d6" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Area dataKey="invoiced" stroke="#ff7a18" fill="#ffe0c2" isAnimationActive={false} /><Area dataKey="collected" stroke="#17836f" fill="#d7f3eb" isAnimationActive={false} /></AreaChart></ResponsiveContainer></div><div className="panel h-80 min-w-0"><h2 className="section-title">Lead Funnel</h2><ResponsiveContainer width="100%" height={250}><BarChart data={d?.leadFunnel || []}><CartesianGrid strokeDasharray="3 3" stroke="#e5e0d6" /><XAxis dataKey="status" hide /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" radius={[6, 6, 0, 0]} fill="#ff7a18" isAnimationActive={false} /></BarChart></ResponsiveContainer></div></div>
    <div className="grid gap-5 xl:grid-cols-4"><AlertPanel title="Renewals" count={d?.renewalsDueSoon?.length} items={d?.renewalsDueSoon?.map((c) => c.businessName)} /><AlertPanel title="Overdue Invoices" count={d?.overdueInvoices?.length} items={d?.overdueInvoices?.map((i) => i.invoiceNumber)} /><AlertPanel title="Overdue Tasks" count={d?.overdueTasksCount} items={["Review overdue task board"]} /><AlertPanel title="Idle Leads" count={d?.idleLeadsCount} items={["Follow up cold or missed leads"]} /></div>
  </div>;
}
function AlertPanel({ title, count = 0, items = [] }) { return <div className="panel"><div className="flex items-center justify-between"><h2 className="section-title">{title}</h2><Badge tone={count ? "OVERDUE" : "DONE"}>{count}</Badge></div><div className="mt-3 space-y-2">{(items?.length ? items : ["Clear"]).map((item) => <div key={item} className="flex items-center gap-2 text-sm text-slate-600"><ChevronRight size={14} />{item}</div>)}</div></div>; }

const leadColumns = ["NEW", "CONTACTED", "DEMO_SCHEDULED", "PROPOSAL_SENT", "NEGOTIATION", "CONVERTED", "LOST"];
function LeadCard({ lead }) { const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: lead.id }); return <Link ref={setNodeRef} style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }} {...listeners} {...attributes} to={`/leads/${lead.id}`} className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm"><div className="font-semibold">{lead.name}</div><div className="text-sm text-slate-500">{lead.businessName}</div><div className="mt-3 flex flex-wrap gap-1">{lead.serviceInterest?.map((item) => <span key={item} className="chip">{pretty(item)}</span>)}</div><div className="mt-3 flex items-center justify-between"><Badge tone={lead.status}>{pretty(lead.source)}</Badge><span className="text-xs text-slate-500">{date(lead.followUpDate)}</span></div></Link>; }
function LeadColumn({ id, children }) { const { setNodeRef } = useDroppable({ id }); return <div ref={setNodeRef} className="min-h-96 w-72 shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-3"><h3 className="mb-3 text-sm font-semibold">{pretty(id)}</h3><div className="space-y-3">{children}</div></div>; }
function Leads() {
  const [view, setView] = useState("kanban");
  const { data, refetch } = useQuery({ queryKey: ["leads"], queryFn: () => api("/leads") });
  const leads = data?.data || [];
  async function onDragEnd(event) { if (event.over?.id && event.active?.id) { await api(`/leads/${event.active.id}`, { method: "PUT", body: JSON.stringify({ status: event.over.id }) }); refetch(); } }
  return <div className="space-y-4"><div className="toolbar"><div className="segmented"><button onClick={() => setView("kanban")} className={view === "kanban" ? "active" : ""}>Kanban</button><button onClick={() => setView("table")} className={view === "table" ? "active" : ""}>Table</button></div><button className="primary"><Plus size={16} /> Add Lead</button></div>{view === "kanban" ? <DndContext onDragEnd={onDragEnd}><div className="flex gap-4 overflow-x-auto pb-2">{leadColumns.map((column) => <LeadColumn key={column} id={column}>{leads.filter((lead) => lead.status === column).map((lead) => <LeadCard key={lead.id} lead={lead} />)}</LeadColumn>)}</div></DndContext> : <DataTable rows={leads} columns={["name", "businessName", "source", "status", "score", "followUpDate"]} />}</div>;
}

function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, refetch } = useQuery({ queryKey: ["lead", id], queryFn: () => api(`/leads/${id}`) });
  const [note, setNote] = useState("");
  const lead = data?.data;
  if (!lead) return <div className="panel">Loading lead...</div>;
  async function convert() { const result = await api(`/leads/${id}/convert`, { method: "POST" }); navigate(`/clients/${result.data.id}`); }
  async function logActivity() { await api(`/leads/${id}/activity`, { method: "POST", body: JSON.stringify({ type: "NOTE", note }) }); setNote(""); refetch(); }
  return <DetailLayout title={lead.businessName || lead.name} aside={<><Badge tone={lead.status}>{pretty(lead.status)}</Badge><Info label="Contact" value={`${lead.name} · ${lead.phone}`} /><Info label="Interest" value={lead.serviceInterest?.map(pretty).join(", ")} /><Info label="Score" value={lead.score} /><button className="primary w-full" onClick={convert}>Convert to Client</button></>}><h2 className="section-title">Activity Timeline</h2><div className="mt-3 flex gap-2"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Log call, WhatsApp, or note" /><button className="primary" onClick={logActivity}>Log</button></div><Timeline items={lead.activities || []} /></DetailLayout>;
}

function Clients() {
  const { data } = useQuery({ queryKey: ["clients"], queryFn: () => api("/clients") });
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(data?.data || []).map((client) => <Link key={client.id} to={`/clients/${client.id}`} className="panel hover:border-emerald-300"><div className="flex items-start gap-3"><div className="grid size-12 place-items-center rounded-lg bg-slate-900 font-bold text-white">{client.businessName.slice(0, 2)}</div><div className="flex-1"><h3 className="font-semibold">{client.businessName}</h3><p className="text-sm text-slate-500">{client.city} · {client.industry}</p></div><Badge tone={client.status}>{pretty(client.status)}</Badge></div><div className="mt-4 flex flex-wrap gap-1">{client.services?.map((item) => <span className="chip" key={item}>{pretty(item)}</span>)}</div><div className="mt-5 grid grid-cols-2 gap-3 text-sm"><Info label="MRR" value={money(client.mrr)} /><Info label="Health" value={`${client.healthScore}%`} /></div></Link>)}</div>;
}
function ClientDetail() {
  const { id } = useParams();
  const [tab, setTab] = useState("Overview");
  const { data } = useQuery({ queryKey: ["client", id], queryFn: () => api(`/clients/${id}`) });
  const client = data?.data;
  if (!client) return <div className="panel">Loading client...</div>;
  const tabs = ["Overview", "Services", "Invoices", "Campaigns", "Content", "Activity"];
  return <DetailLayout title={client.businessName} aside={<><Badge tone={client.status}>{pretty(client.status)}</Badge><Info label="Contact" value={`${client.contactPerson} · ${client.phone}`} /><Info label="City" value={client.city} /><Info label="Health" value={`${client.healthScore}%`} /><Info label="Renewal" value={date(client.renewalDate)} /></>}><div className="tabs">{tabs.map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div>{tab === "Overview" && <div className="grid gap-4 md:grid-cols-2"><Info label="Industry" value={client.industry} /><Info label="Website" value={client.websiteUrl} /><Info label="Total Value" value={money(client.totalValue)} /></div>}{tab === "Services" && <DataTable rows={client.services} columns={["serviceType", "packageName", "monthlyValue", "status"]} />}{tab === "Invoices" && <DataTable rows={client.invoices} columns={["invoiceNumber", "totalAmount", "status", "dueDate"]} />}{tab === "Campaigns" && <DataTable rows={client.campaigns} columns={["platform", "adSpend", "leadsGenerated", "ctr", "cpl"]} />}{tab === "Content" && <DataTable rows={client.calendarItems} columns={["platform", "postType", "scheduledDate", "status"]} />}{tab === "Activity" && <Timeline items={client.activities || []} />}</DetailLayout>;
}

function Services() {
  const { data: services } = useQuery({ queryKey: ["services"], queryFn: () => api("/services") });
  const { data: tasks } = useQuery({ queryKey: ["tasks"], queryFn: () => api("/tasks") });
  const cols = ["PENDING", "IN_PROGRESS", "REVIEW", "DONE"];
  return <div className="grid gap-5 xl:grid-cols-[.9fr_1.4fr]"><div className="panel"><h2 className="section-title">Service Orders</h2><DataTable rows={services?.data || []} columns={["serviceType", "packageName", "monthlyValue", "status"]} /></div><div className="panel"><h2 className="section-title">Task Board</h2><div className="mt-4 grid gap-3 md:grid-cols-4">{cols.map((col) => <div key={col} className="rounded-lg bg-slate-50 p-3"><h3 className="mb-3 text-sm font-semibold">{pretty(col)}</h3>{(tasks?.data || []).filter((task) => task.status === col).map((task) => <div key={task.id} className="mb-2 rounded-lg border border-slate-200 bg-white p-3 text-sm"><div className="font-medium">{task.title}</div><div className="mt-2 flex items-center justify-between"><Badge tone={task.priority}>{pretty(task.priority)}</Badge><span className="text-xs text-slate-500">{date(task.dueDate)}</span></div></div>)}</div>)}</div></div></div>;
}
function ContentCalendar() {
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: () => api("/clients") });
  const [clientId, setClientId] = useState("c-1");
  const { data } = useQuery({ queryKey: ["calendar", clientId], queryFn: () => api(`/calendar?clientId=${clientId}&month=5&year=2026`) });
  const items = data?.data || [];
  return <div className="space-y-4"><div className="toolbar"><select className="input max-w-xs" value={clientId} onChange={(e) => setClientId(e.target.value)}>{(clients?.data || []).map((client) => <option key={client.id} value={client.id}>{client.businessName}</option>)}</select><button className="primary"><Plus size={16} /> Generate Month</button></div><div className="grid grid-cols-7 gap-2">{Array.from({ length: 31 }, (_, i) => i + 1).map((day) => <div key={day} className="min-h-28 rounded-lg border border-slate-200 bg-white p-2"><div className="text-xs font-semibold text-slate-500">{day}</div><div className="mt-2 space-y-1">{items.filter((item) => new Date(item.scheduledDate).getDate() === day).map((item) => <div key={item.id} className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">{pretty(item.platform)} · {pretty(item.status)}</div>)}</div></div>)}</div></div>;
}
function Invoices() { const { data } = useQuery({ queryKey: ["invoices"], queryFn: () => api("/invoices") }); return <div className="panel"><div className="toolbar"><h2 className="section-title">Invoices</h2><button className="primary"><Plus size={16} /> Create Invoice</button></div><DataTable rows={data?.data || []} columns={["invoiceNumber", "client.businessName", "totalAmount", "status", "dueDate"]} action={(row) => <a className="text-sm font-semibold text-emerald-700" href={`${API_URL}/invoices/${row.id}/pdf`} target="_blank">PDF</a>} /></div>; }
function Campaigns() { const { data } = useQuery({ queryKey: ["campaigns"], queryFn: () => api("/campaigns") }); return <div className="grid gap-5 xl:grid-cols-[1fr_.8fr]"><div className="panel"><h2 className="section-title">Campaign Performance</h2><DataTable rows={data?.data || []} columns={["platform", "adSpend", "impressions", "clicks", "ctr", "leadsGenerated", "cpl"]} /></div><div className="panel"><h2 className="section-title">SEO Keyword Tracker</h2><DataTable rows={data?.data?.[0]?.seoKeywords || []} columns={["keyword", "prev", "current"]} /></div></div>; }
function TeamWorkload() { const { data } = useQuery({ queryKey: ["workload"], queryFn: () => api("/tasks/workload") }); return <div className="panel"><h2 className="section-title">Team Workload</h2><div className="mt-4 space-y-3">{(data?.data || []).map((user) => { const pct = user.totalTasks ? Math.round(user.doneTasks / user.totalTasks * 100) : 0; return <div key={user.userId} className="rounded-lg border border-slate-200 p-3"><div className="flex items-center justify-between"><div><div className="font-semibold">{user.name}</div><div className="text-sm text-slate-500">{pretty(user.role)}</div></div><Badge tone={user.overdueTasks ? "OVERDUE" : "DONE"}>{user.overdueTasks} overdue</Badge></div><div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-emerald-600" style={{ width: `${pct}%` }} /></div></div>; })}</div></div>; }
function Portal() { return <div className="space-y-5"><div className="panel"><h2 className="section-title">Client Portal</h2><p className="text-sm text-slate-600">Reports, invoices, and content approvals are filtered to the signed-in client account.</p></div><Invoices /><ContentCalendar /></div>; }
function SettingsPage() { return <div className="grid gap-5 xl:grid-cols-2"><div className="panel"><h2 className="section-title">Agency Profile</h2><label className="field-label">Agency name</label><input className="input" defaultValue="OptiBrandz Marketing Agency" /><label className="field-label mt-4">Address</label><textarea className="input min-h-24" defaultValue="Vapi, Gujarat, India" /><button className="primary mt-4">Save Settings</button></div><div className="panel"><h2 className="section-title">System Readiness</h2>{["JWT auth", "Role guards", "Prisma schema", "Invoice PDF", "Cron alerts", "Responsive shell"].map((item) => <div key={item} className="flex items-center gap-2 border-b border-slate-100 py-3 text-sm"><CheckCircle2 size={17} className="text-emerald-600" />{item}</div>)}</div></div>; }

function AIAgent() {
  const [prompt, setPrompt] = useState("What should I focus on today to grow revenue and avoid client risk?");
  const [answer, setAnswer] = useState("");
  const [imageAnswer, setImageAnswer] = useState("");
  const [imagePrompt, setImagePrompt] = useState("Analyze this creative/screenshot for campaign potential, improvements, CTA, and next actions.");
  const [busy, setBusy] = useState("");
  const [contentForm, setContentForm] = useState({ businessType: "dental clinic in Vapi", platform: "Instagram", goal: "more WhatsApp enquiries" });
  const { data: status } = useQuery({ queryKey: ["ai-status"], queryFn: () => api("/ai/status") });
  const { data: leadsData } = useQuery({ queryKey: ["leads"], queryFn: () => api("/leads") });
  const { data: clientsData } = useQuery({ queryKey: ["clients"], queryFn: () => api("/clients") });
  const lead = leadsData?.data?.[0];
  const client = clientsData?.data?.[0];

  async function runJson(path, body, label) {
    setBusy(label);
    try {
      const result = await api(path, { method: "POST", body: JSON.stringify(body || {}) });
      setAnswer(result.data.text);
    } finally {
      setBusy("");
    }
  }
  async function analyzeImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy("image");
    const form = new FormData();
    form.append("image", file);
    form.append("prompt", imagePrompt);
    try {
      const response = await fetch(`${API_URL}/ai/image-agent`, { method: "POST", headers: useAuth.getState().headers(), body: form, credentials: "include" });
      if (!response.ok) throw new Error("Image analysis failed");
      const result = await response.json();
      setImageAnswer(result.data.text);
    } finally {
      setBusy("");
    }
  }

  return <div className="space-y-5">
    <section className="hero-panel rounded-2xl p-5 text-white lg:p-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div><div className="flex items-center gap-3"><div className="grid size-12 place-items-center rounded-full bg-[#ffd84d] text-[#090909]"><Bot size={24} /></div><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ffd84d]">Gemini powered</p><h2 className="text-3xl font-black tracking-tight">Your personal Optibrandz AI Growth Agent</h2></div></div><p className="mt-4 max-w-3xl text-sm leading-6 text-white/68">Use it for lead replies, campaign strategy, creative feedback, content ideas, client risk summaries, and daily agency priorities.</p></div>
        <div className="hero-score"><div><span>Gemini status</span><strong>{status?.data?.configured ? "Live" : "Demo"}</strong></div></div>
      </div>
    </section>
    <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <div className="panel">
        <div className="flex items-center gap-2"><Bot className="text-[#ff7a18]" size={20} /><h2 className="section-title">Ask the CRM Agent</h2></div>
        <textarea className="input mt-4 min-h-28" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <button className="primary mt-3" onClick={() => runJson("/ai/chat", { prompt }, "chat")} disabled={Boolean(busy)}><Send size={16} /> {busy === "chat" ? "Thinking..." : "Ask Gemini"}</button>
        {answer && <AIOutput text={answer} />}
      </div>
      <div className="panel">
        <div className="flex items-center gap-2"><ImageUp className="text-[#ff7a18]" size={20} /><h2 className="section-title">Image to Personal Agent</h2></div>
        <p className="mt-3 text-sm leading-6 text-zinc-600">Upload any creative, screenshot, ad image, design draft, or competitor post. Gemini will analyze it through your agency CRM context.</p>
        <textarea className="input mt-4 min-h-20" value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} />
        <label className="secondary-upload mt-3"><UploadCloud size={17} /> {busy === "image" ? "Analyzing..." : "Upload Image"}<input className="hidden" type="file" accept="image/*" onChange={analyzeImage} /></label>
        {imageAnswer && <AIOutput text={imageAnswer} />}
      </div>
    </div>
    <div className="grid gap-5 xl:grid-cols-3">
      <AICard title="Lead Follow-Up" icon={Megaphone} text={lead ? `${lead.businessName} · ${pretty(lead.status)}` : "No lead found"} onClick={() => lead && runJson(`/ai/leads/${lead.id}/followup`, {}, "lead")} busy={busy === "lead"} />
      <AICard title="Client Health Brief" icon={BriefcaseBusiness} text={client ? `${client.businessName} · ${client.healthScore}% health` : "No client found"} onClick={() => client && runJson(`/ai/clients/${client.id}/brief`, {}, "client")} busy={busy === "client"} />
      <div className="panel">
        <div className="flex items-center gap-2"><Wand2 className="text-[#ff7a18]" size={20} /><h2 className="section-title">Content Ideas</h2></div>
        <input className="input mt-4" value={contentForm.businessType} onChange={(e) => setContentForm({ ...contentForm, businessType: e.target.value })} />
        <input className="input mt-3" value={contentForm.platform} onChange={(e) => setContentForm({ ...contentForm, platform: e.target.value })} />
        <input className="input mt-3" value={contentForm.goal} onChange={(e) => setContentForm({ ...contentForm, goal: e.target.value })} />
        <button className="primary mt-3" onClick={() => runJson("/ai/content-ideas", contentForm, "content")} disabled={Boolean(busy)}><Wand2 size={16} /> Generate</button>
      </div>
    </div>
  </div>;
}

function cleanAIText(text) { return String(text || "").replaceAll("**", "").replace(/^\s*\*\s+/gm, "• "); }
function AIOutput({ text }) { return <div className="ai-output mt-4 whitespace-pre-wrap text-sm leading-6">{cleanAIText(text)}</div>; }
function AICard({ title, icon: Icon, text, onClick, busy }) { return <div className="panel"><div className="flex items-center gap-2"><Icon className="text-[#ff7a18]" size={20} /><h2 className="section-title">{title}</h2></div><p className="mt-3 text-sm text-zinc-600">{text}</p><button className="primary mt-4" onClick={onClick} disabled={busy}><Sparkles size={16} /> {busy ? "Generating..." : "Generate"}</button></div>; }

function DetailLayout({ title, aside, children }) { return <div className="grid gap-5 xl:grid-cols-[320px_1fr]"><aside className="panel h-fit"><h2 className="mb-4 text-xl font-bold">{title}</h2><div className="space-y-4">{aside}</div></aside><section className="panel min-h-96">{children}</section></div>; }
function Info({ label, value }) { return <div><div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-sm font-semibold text-slate-800">{value || "-"}</div></div>; }
function Timeline({ items }) { return <div className="mt-4 space-y-3">{(items || []).map((item) => <div key={item.id} className="rounded-lg border border-slate-200 p-3"><div className="flex items-center justify-between"><Badge tone={item.type}>{pretty(item.type)}</Badge><span className="text-xs text-slate-500">{date(item.createdAt)}</span></div><p className="mt-2 text-sm text-slate-600">{item.note}</p></div>)}</div>; }
function valueAt(row, key) { return key.split(".").reduce((acc, part) => acc?.[part], row); }
function DataTable({ rows = [], columns = [], action }) { return <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-400">{columns.map((col) => <th className="px-3 py-3 font-semibold" key={col}>{pretty(col.split(".").at(-1))}</th>)}{action && <th className="px-3 py-3">Actions</th>}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id || index} className="border-b border-slate-100">{columns.map((col) => { const value = valueAt(row, col); return <td className="px-3 py-3" key={col}>{col.toLowerCase().includes("amount") || col.toLowerCase().includes("value") || col === "adSpend" ? money(value) : col.toLowerCase().includes("date") ? date(value) : ["status", "priority"].includes(col) ? <Badge tone={value}>{pretty(value)}</Badge> : pretty(value)}</td>; })}{action && <td className="px-3 py-3">{action(row)}</td>}</tr>)}</tbody></table></div>; }
function NotFound() { return <div className="panel"><h2 className="text-xl font-bold">Page not found</h2><p className="mt-2 text-sm text-slate-600">The CRM route you opened does not exist.</p></div>; }

function App() {
  return <QueryClientProvider client={queryClient}><BrowserRouter><Routes>
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="/login" element={<Login />} />
    <Route path="/portal/login" element={<Login portal />} />
    <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
    <Route path="/ai" element={<RequireAuth><AIAgent /></RequireAuth>} />
    <Route path="/leads" element={<RequireAuth><Leads /></RequireAuth>} />
    <Route path="/leads/:id" element={<RequireAuth><LeadDetail /></RequireAuth>} />
    <Route path="/clients" element={<RequireAuth><Clients /></RequireAuth>} />
    <Route path="/clients/:id" element={<RequireAuth><ClientDetail /></RequireAuth>} />
    <Route path="/services" element={<RequireAuth><Services /></RequireAuth>} />
    <Route path="/tasks" element={<RequireAuth><Services /></RequireAuth>} />
    <Route path="/content" element={<RequireAuth><ContentCalendar /></RequireAuth>} />
    <Route path="/invoices" element={<RequireAuth><Invoices /></RequireAuth>} />
    <Route path="/campaigns" element={<RequireAuth><Campaigns /></RequireAuth>} />
    <Route path="/team/workload" element={<RequireAuth roles={["OWNER"]}><TeamWorkload /></RequireAuth>} />
    <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
    <Route path="/portal/dashboard" element={<RequireAuth roles={["CLIENT"]}><Portal /></RequireAuth>} />
    <Route path="*" element={<RequireAuth><NotFound /></RequireAuth>} />
  </Routes></BrowserRouter></QueryClientProvider>;
}
export default App;
