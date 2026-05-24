import { useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { create } from "zustand";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Bell, Bot, BriefcaseBusiness, CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign, ClipboardList, Edit3, FileText, Gauge, ImageUp, LayoutDashboard, LogOut, Megaphone, Plus, Save, Search, Send, Settings, Sparkles, UploadCloud, Users, Wand2, X } from "lucide-react";
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
  const [showNotifications, setShowNotifications] = useState(false);
  const title = nav.find((item) => location.pathname.startsWith(item[1].startsWith("/team") ? "/team" : item[1]))?.[0] || "OptiBrandz CRM";
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: () => api("/notifications"), enabled: Boolean(user) });
  const notificationItems = data?.data || [];
  const unread = notificationItems.filter((item) => !item.isRead).length || 0;
  return <div className="app-shell min-h-screen text-zinc-950">
    <aside className="brand-sidebar fixed inset-y-0 left-0 z-20 hidden w-68 border-r lg:block">
      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-5"><BrandLogo /><div><div className="font-semibold text-white">Optibrandz</div><div className="text-xs text-white/55">Agency growth CRM</div></div></div>
      <nav className="space-y-1 p-3">{nav.map(([label, href, Icon]) => <Link key={href} to={href} className={`sidebar-link ${location.pathname.startsWith(href.startsWith("/team") ? "/team" : href) ? "active" : ""}`}><Icon size={18} />{label}</Link>)}</nav>
      <div className="absolute bottom-0 w-full border-t border-white/10 p-4"><div className="user-strip flex items-center gap-3"><div className="grid size-9 place-items-center rounded-lg bg-[#ffd84d] text-sm font-black text-[#090909]">{user?.avatar || "AP"}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-white">{user?.name}</div><div className="truncate text-xs text-white/55">{pretty(user?.role)}</div></div><button className="dark-icon-button" onClick={logout} title="Logout"><LogOut size={16} /></button></div></div>
    </aside>
    <div className="lg:pl-68"><header className="topbar sticky top-0 z-10 flex h-20 items-center gap-3 border-b px-4 backdrop-blur lg:px-6"><div><div className="flex items-center gap-2"><h1 className="min-w-fit text-lg font-black tracking-tight">{title}</h1><span className="demo-badge">Demo Data</span></div><p className="hidden text-xs font-semibold text-zinc-500 sm:block">Use Add and Edit on each page to replace demo records with real CRM data.</p></div><SearchBox /><div className="relative"><button className="icon-button relative" title="Notifications" onClick={() => setShowNotifications(!showNotifications)}><Bell size={18} />{unread > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[#ff7a18] text-[10px] font-black text-white">{unread}</span>}</button>{showNotifications && <NotificationPanel items={notificationItems} onClose={() => setShowNotifications(false)} />}</div></header><main className="p-4 pb-24 lg:p-6">{children}</main></div>
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-black/10 bg-[#fff9ed]/95 p-1 backdrop-blur lg:hidden">{nav.slice(0, 5).map(([label, href, Icon]) => <Link key={href} to={href} className="flex flex-col items-center gap-1 rounded-md py-2 text-[11px] font-semibold text-zinc-700"><Icon size={18} />{label}</Link>)}</nav>
  </div>;
}

function SearchBox() {
  const [term, setTerm] = useState("");
  const [focused, setFocused] = useState(false);
  const navigate = useNavigate();
  const open = focused && term.trim().length >= 2;
  const { data, isFetching } = useQuery({ queryKey: ["search", term], queryFn: () => api(`/search?q=${encodeURIComponent(term)}`), enabled: open });
  const groups = [
    ["Clients", data?.data?.clients || [], (item) => `/clients/${item.id}`, (item) => item.businessName],
    ["Leads", data?.data?.leads || [], (item) => `/leads/${item.id}`, (item) => `${item.name} · ${item.phone}`],
    ["Invoices", data?.data?.invoices || [], (item) => "/invoices", (item) => `${item.invoiceNumber} · ${money(item.totalAmount)}`]
  ];
  const hasResults = groups.some(([, rows]) => rows.length);
  function go(path) {
    setTerm("");
    setFocused(false);
    navigate(path);
  }
  return <div className="relative max-w-xl flex-1">
    <Search className="pointer-events-none absolute left-3 top-2.5 text-zinc-400" size={18} />
    <input className="h-10 w-full rounded-full border border-black/10 bg-white/80 pl-10 pr-3 text-sm outline-none focus:border-[#ff7a18] focus:ring-4 focus:ring-[#ff7a18]/15" placeholder="Search clients, leads, invoices" value={term} onFocus={() => setFocused(true)} onChange={(e) => setTerm(e.target.value)} />
    {open && <div className="search-popover">
      {isFetching && <div className="search-empty">Searching CRM...</div>}
      {!isFetching && !hasResults && <div className="search-empty">No matching CRM records found.</div>}
      {!isFetching && groups.map(([label, rows, href, title]) => rows.length > 0 && <div key={label} className="py-2">
        <div className="px-3 pb-1 text-[11px] font-black uppercase tracking-wide text-zinc-400">{label}</div>
        {rows.map((item) => <button key={item.id} className="search-result" onMouseDown={(event) => { event.preventDefault(); go(href(item)); }}>
          <span>{title(item)}</span>
          <ChevronRight size={15} />
        </button>)}
      </div>)}
    </div>}
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

function NotificationPanel({ items = [], onClose }) {
  const todayItems = items.filter((item) => ["TASK", "LEAD", "INVOICE", "CONTENT", "RENEWAL"].includes(item.type));
  return <div className="notification-panel">
    <div className="flex items-center justify-between gap-3 border-b border-black/10 p-4">
      <div><h2 className="text-sm font-black">Today’s Action Center</h2><p className="text-xs font-semibold text-zinc-500">{todayItems.length} things need attention</p></div>
      <button className="table-action" onClick={onClose}>Close</button>
    </div>
    <div className="max-h-[460px] overflow-auto p-2">
      {items.length === 0 && <div className="p-4 text-sm font-semibold text-zinc-500">No actions for today. Nice and quiet.</div>}
      {items.map((item) => <Link key={item.id} to={item.link || "/dashboard"} onClick={onClose} className="notification-item">
        <div className={`notification-dot ${item.priority === "HIGH" ? "high" : ""}`} />
        <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-sm font-black">{item.title || pretty(item.type)}</span><span className="rounded-full bg-[#fff3ce] px-2 py-0.5 text-[10px] font-black text-[#6a4700]">{pretty(item.type)}</span></div><p className="mt-1 text-xs leading-5 text-zinc-600">{item.message}</p>{item.dueAt && <p className="mt-1 text-[11px] font-bold text-zinc-400">Due {date(item.dueAt)}</p>}</div>
        <ChevronRight size={16} className="text-zinc-400" />
      </Link>)}
    </div>
  </div>;
}

function refreshCRM() {
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["clients"] });
  queryClient.invalidateQueries({ queryKey: ["leads"] });
  queryClient.invalidateQueries({ queryKey: ["services"] });
  queryClient.invalidateQueries({ queryKey: ["tasks"] });
  queryClient.invalidateQueries({ queryKey: ["invoices"] });
  queryClient.invalidateQueries({ queryKey: ["campaigns"] });
  queryClient.invalidateQueries({ queryKey: ["notifications"] });
  queryClient.invalidateQueries({ queryKey: ["workload"] });
}

function Modal({ title, children, onClose }) {
  return <div className="modal-backdrop">
    <div className="modal-panel">
      <div className="flex items-center justify-between gap-4 border-b border-black/10 p-4">
        <h2 className="text-lg font-black">{title}</h2>
        <button className="icon-button" onClick={onClose} title="Close"><X size={18} /></button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  </div>;
}

function Field({ label, value, onChange, type = "text", options, rows = 1 }) {
  return <label className="block">
    <span className="field-label">{label}</span>
    {options ? <select className="input" value={value || ""} onChange={(e) => onChange(e.target.value)}>{options.map((item) => { const option = typeof item === "string" ? { value: item, label: pretty(item) } : item; return <option key={option.value} value={option.value}>{option.label}</option>; })}</select> :
      rows > 1 ? <textarea className="input" rows={rows} value={value || ""} onChange={(e) => onChange(e.target.value)} /> :
      <input className="input" type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />}
  </label>;
}

function splitList(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function EditRecordModal({ title, initial = {}, fields, onSubmit, onClose }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {};
      fields.forEach((field) => {
        const raw = form[field.name];
        if (field.kind === "number") payload[field.name] = Number(raw || 0);
        else if (field.kind === "list") payload[field.name] = Array.isArray(raw) ? raw : splitList(raw);
        else if (field.kind === "lineItems") payload[field.name] = [{ description: form.description || "Service", amount: Number(form.amount || 0) }];
        else if (field.name !== "description" && field.name !== "amount") payload[field.name] = raw;
      });
      await onSubmit(payload);
      refreshCRM();
      onClose();
    } catch (err) {
      setError(err.message || "Could not save record.");
    } finally {
      setSaving(false);
    }
  }
  return <Modal title={title} onClose={onClose}>
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      {fields.map((field) => <Field key={field.name} label={field.label} type={field.type} rows={field.rows} options={field.options} value={Array.isArray(form[field.name]) ? form[field.name].join(", ") : form[field.name]} onChange={(value) => setForm({ ...form, [field.name]: value })} />)}
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700 md:col-span-2">{error}</div>}
      <div className="flex justify-end gap-3 md:col-span-2"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}><Save size={16} /> {saving ? "Saving..." : "Save"}</button></div>
    </form>
  </Modal>;
}

const leadColumns = ["NEW", "CONTACTED", "DEMO_SCHEDULED", "PROPOSAL_SENT", "NEGOTIATION", "CONVERTED", "LOST"];
function LeadCard({ lead }) { const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: lead.id }); return <Link ref={setNodeRef} style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }} {...listeners} {...attributes} to={`/leads/${lead.id}`} className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm"><div className="font-semibold">{lead.name}</div><div className="text-sm text-slate-500">{lead.businessName}</div><div className="mt-3 flex flex-wrap gap-1">{lead.serviceInterest?.map((item) => <span key={item} className="chip">{pretty(item)}</span>)}</div><div className="mt-3 flex items-center justify-between"><Badge tone={lead.status}>{pretty(lead.source)}</Badge><span className="text-xs text-slate-500">{date(lead.followUpDate)}</span></div></Link>; }
function LeadColumn({ id, children }) { const { setNodeRef } = useDroppable({ id }); return <div ref={setNodeRef} className="min-h-96 w-72 shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-3"><h3 className="mb-3 text-sm font-semibold">{pretty(id)}</h3><div className="space-y-3">{children}</div></div>; }
function Leads() {
  const [view, setView] = useState("kanban");
  const [editing, setEditing] = useState(null);
  const { data, refetch } = useQuery({ queryKey: ["leads"], queryFn: () => api("/leads") });
  const leads = data?.data || [];
  async function onDragEnd(event) { if (event.over?.id && event.active?.id) { await api(`/leads/${event.active.id}`, { method: "PUT", body: JSON.stringify({ status: event.over.id }) }); refetch(); } }
  const leadFields = [
    { name: "name", label: "Contact Name" }, { name: "phone", label: "Phone" }, { name: "email", label: "Email" }, { name: "businessName", label: "Business Name" },
    { name: "city", label: "City" }, { name: "source", label: "Source", options: ["WHATSAPP", "INSTAGRAM", "GOOGLE_ADS", "WEBSITE", "REFERRAL", "WALK_IN"] },
    { name: "status", label: "Status", options: leadColumns }, { name: "serviceInterest", label: "Services, comma separated", kind: "list" },
    { name: "budget", label: "Budget" }, { name: "followUpDate", label: "Follow-up Date", type: "date" }, { name: "notes", label: "Notes", rows: 3 }
  ];
  async function saveLead(payload) {
    const body = { ...payload, followUpDate: payload.followUpDate ? new Date(payload.followUpDate).toISOString() : undefined };
    await api(editing?.id ? `/leads/${editing.id}` : "/leads", { method: editing?.id ? "PUT" : "POST", body: JSON.stringify(body) });
    refetch();
  }
  return <div className="space-y-4"><div className="toolbar"><div className="segmented"><button onClick={() => setView("kanban")} className={view === "kanban" ? "active" : ""}>Kanban</button><button onClick={() => setView("table")} className={view === "table" ? "active" : ""}>Table</button></div><button className="primary" onClick={() => setEditing({})}><Plus size={16} /> Add Lead</button></div>{view === "kanban" ? <DndContext onDragEnd={onDragEnd}><div className="flex gap-4 overflow-x-auto pb-2">{leadColumns.map((column) => <LeadColumn key={column} id={column}>{leads.filter((lead) => lead.status === column).map((lead) => <LeadCard key={lead.id} lead={lead} />)}</LeadColumn>)}</div></DndContext> : <DataTable rows={leads} columns={["name", "businessName", "source", "status", "score", "followUpDate"]} action={(row) => <button className="table-action" onClick={() => setEditing(row)}><Edit3 size={14} /> Edit</button>} />}{editing && <EditRecordModal title={editing.id ? "Edit Lead" : "Add Lead"} initial={{ source: "WHATSAPP", status: "NEW", serviceInterest: [], ...editing, followUpDate: editing.followUpDate?.slice?.(0, 10) }} fields={leadFields} onSubmit={saveLead} onClose={() => setEditing(null)} />}</div>;
}

function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, refetch } = useQuery({ queryKey: ["lead", id], queryFn: () => api(`/leads/${id}`) });
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const lead = data?.data;
  if (!lead) return <div className="panel">Loading lead...</div>;
  async function convert() { const result = await api(`/leads/${id}/convert`, { method: "POST" }); navigate(`/clients/${result.data.id}`); }
  async function logActivity() { await api(`/leads/${id}/activity`, { method: "POST", body: JSON.stringify({ type: "NOTE", note }) }); setNote(""); refetch(); }
  async function saveLead(payload) { await api(`/leads/${id}`, { method: "PUT", body: JSON.stringify(payload) }); refetch(); }
  return <DetailLayout title={lead.businessName || lead.name} aside={<><Badge tone={lead.status}>{pretty(lead.status)}</Badge><Info label="Contact" value={`${lead.name} · ${lead.phone}`} /><Info label="Interest" value={lead.serviceInterest?.map(pretty).join(", ")} /><Info label="Score" value={lead.score} /><button className="secondary-button w-full" onClick={() => setEditing(true)}><Edit3 size={16} /> Edit Lead</button><button className="primary w-full" onClick={convert}>Convert to Client</button></>}><h2 className="section-title">Activity Timeline</h2><div className="mt-3 flex gap-2"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Log call, WhatsApp, or note" /><button className="primary" onClick={logActivity}>Log</button></div><Timeline items={lead.activities || []} />{editing && <EditRecordModal title="Edit Lead" initial={lead} fields={[{ name: "name", label: "Contact Name" }, { name: "phone", label: "Phone" }, { name: "email", label: "Email" }, { name: "businessName", label: "Business Name" }, { name: "city", label: "City" }, { name: "status", label: "Status", options: leadColumns }, { name: "serviceInterest", label: "Services", kind: "list" }, { name: "budget", label: "Budget" }, { name: "notes", label: "Notes", rows: 3 }]} onSubmit={saveLead} onClose={() => setEditing(false)} />}</DetailLayout>;
}

function Clients() {
  const [editing, setEditing] = useState(null);
  const { data, refetch } = useQuery({ queryKey: ["clients"], queryFn: () => api("/clients") });
  const clientFields = [
    { name: "businessName", label: "Business Name" }, { name: "contactPerson", label: "Contact Person" }, { name: "phone", label: "Phone" }, { name: "email", label: "Email" },
    { name: "city", label: "City" }, { name: "industry", label: "Industry" }, { name: "websiteUrl", label: "Website" }, { name: "status", label: "Status", options: ["ACTIVE", "ONBOARDING", "PAUSED", "CHURNED"] },
    { name: "healthScore", label: "Health Score", kind: "number", type: "number" }, { name: "totalValue", label: "Total Value", kind: "number", type: "number" }, { name: "renewalDate", label: "Renewal Date", type: "date" }
  ];
  async function saveClient(payload) {
    const body = { ...payload, renewalDate: payload.renewalDate ? new Date(payload.renewalDate).toISOString() : undefined };
    await api(editing?.id ? `/clients/${editing.id}` : "/clients", { method: editing?.id ? "PUT" : "POST", body: JSON.stringify(body) });
    refetch();
  }
  return <div className="space-y-4"><div className="toolbar"><h2 className="section-title">Clients</h2><button className="primary" onClick={() => setEditing({ status: "ACTIVE", healthScore: 100 })}><Plus size={16} /> Add Client</button></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(data?.data || []).map((client) => <div key={client.id} className="panel hover:border-emerald-300"><Link to={`/clients/${client.id}`}><div className="flex items-start gap-3"><div className="grid size-12 place-items-center rounded-lg bg-slate-900 font-bold text-white">{client.businessName.slice(0, 2)}</div><div className="flex-1"><h3 className="font-semibold">{client.businessName}</h3><p className="text-sm text-slate-500">{client.city} · {client.industry}</p></div><Badge tone={client.status}>{pretty(client.status)}</Badge></div><div className="mt-4 flex flex-wrap gap-1">{client.services?.map((item) => <span className="chip" key={item}>{pretty(item)}</span>)}</div><div className="mt-5 grid grid-cols-2 gap-3 text-sm"><Info label="MRR" value={money(client.mrr)} /><Info label="Health" value={`${client.healthScore}%`} /></div></Link><button className="table-action mt-4" onClick={() => setEditing({ ...client, renewalDate: client.renewalDate?.slice?.(0, 10) })}><Edit3 size={14} /> Edit</button></div>)}</div>{editing && <EditRecordModal title={editing.id ? "Edit Client" : "Add Client"} initial={editing} fields={clientFields} onSubmit={saveClient} onClose={() => setEditing(null)} />}</div>;
}
function ClientDetail() {
  const { id } = useParams();
  const [tab, setTab] = useState("Overview");
  const [editing, setEditing] = useState(false);
  const { data, refetch } = useQuery({ queryKey: ["client", id], queryFn: () => api(`/clients/${id}`) });
  const client = data?.data;
  if (!client) return <div className="panel">Loading client...</div>;
  const tabs = ["Overview", "Services", "Invoices", "Campaigns", "Content", "Activity"];
  async function saveClient(payload) { await api(`/clients/${id}`, { method: "PUT", body: JSON.stringify(payload) }); refetch(); }
  return <DetailLayout title={client.businessName} aside={<><Badge tone={client.status}>{pretty(client.status)}</Badge><Info label="Contact" value={`${client.contactPerson} · ${client.phone}`} /><Info label="City" value={client.city} /><Info label="Health" value={`${client.healthScore}%`} /><Info label="Renewal" value={date(client.renewalDate)} /><button className="secondary-button w-full" onClick={() => setEditing(true)}><Edit3 size={16} /> Edit Client</button></>}><div className="tabs">{tabs.map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div>{tab === "Overview" && <div className="grid gap-4 md:grid-cols-2"><Info label="Industry" value={client.industry} /><Info label="Website" value={client.websiteUrl} /><Info label="Total Value" value={money(client.totalValue)} /></div>}{tab === "Services" && <DataTable rows={client.services} columns={["serviceType", "packageName", "monthlyValue", "status"]} />}{tab === "Invoices" && <DataTable rows={client.invoices} columns={["invoiceNumber", "totalAmount", "status", "dueDate"]} />}{tab === "Campaigns" && <DataTable rows={client.campaigns} columns={["platform", "adSpend", "leadsGenerated", "ctr", "cpl"]} />}{tab === "Content" && <DataTable rows={client.calendarItems} columns={["platform", "postType", "scheduledDate", "status"]} />}{tab === "Activity" && <Timeline items={client.activities || []} />}{editing && <EditRecordModal title="Edit Client" initial={{ ...client, renewalDate: client.renewalDate?.slice?.(0, 10) }} fields={[{ name: "businessName", label: "Business Name" }, { name: "contactPerson", label: "Contact Person" }, { name: "phone", label: "Phone" }, { name: "email", label: "Email" }, { name: "city", label: "City" }, { name: "industry", label: "Industry" }, { name: "websiteUrl", label: "Website" }, { name: "status", label: "Status", options: ["ACTIVE", "ONBOARDING", "PAUSED", "CHURNED"] }, { name: "healthScore", label: "Health Score", kind: "number", type: "number" }, { name: "totalValue", label: "Total Value", kind: "number", type: "number" }, { name: "renewalDate", label: "Renewal Date", type: "date" }]} onSubmit={saveClient} onClose={() => setEditing(false)} />}</DetailLayout>;
}

function Services() {
  const [serviceEdit, setServiceEdit] = useState(null);
  const [taskEdit, setTaskEdit] = useState(null);
  const { data: services } = useQuery({ queryKey: ["services"], queryFn: () => api("/services") });
  const { data: tasks } = useQuery({ queryKey: ["tasks"], queryFn: () => api("/tasks") });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: () => api("/clients") });
  const cols = ["PENDING", "IN_PROGRESS", "REVIEW", "DONE"];
  const clientOptions = (clients?.data || []).map((c) => ({ value: c.id, label: c.businessName }));
  async function saveService(payload) { await api(serviceEdit?.id ? `/services/${serviceEdit.id}` : "/services", { method: serviceEdit?.id ? "PUT" : "POST", body: JSON.stringify(payload) }); refreshCRM(); }
  async function saveTask(payload) { await api(taskEdit?.id ? `/tasks/${taskEdit.id}` : "/tasks", { method: taskEdit?.id ? "PUT" : "POST", body: JSON.stringify(payload) }); refreshCRM(); }
  return <div className="grid gap-5 xl:grid-cols-[.9fr_1.4fr]"><div className="panel"><div className="toolbar"><h2 className="section-title">Service Orders</h2><button className="primary" onClick={() => setServiceEdit({ clientId: clientOptions[0]?.value, serviceType: "SEO", monthlyValue: 0 })}><Plus size={16} /> Add Service</button></div><DataTable rows={services?.data || []} columns={["serviceType", "packageName", "monthlyValue", "status"]} action={(row) => <button className="table-action" onClick={() => setServiceEdit(row)}><Edit3 size={14} /> Edit</button>} /></div><div className="panel"><div className="toolbar"><h2 className="section-title">Task Board</h2><button className="primary" onClick={() => setTaskEdit({ serviceOrderId: services?.data?.[0]?.id, assignedToId: "u-owner", priority: "MEDIUM" })}><Plus size={16} /> Add Task</button></div><div className="mt-4 grid gap-3 md:grid-cols-4">{cols.map((col) => <div key={col} className="rounded-lg bg-slate-50 p-3"><h3 className="mb-3 text-sm font-semibold">{pretty(col)}</h3>{(tasks?.data || []).filter((task) => task.status === col).map((task) => <div key={task.id} className="mb-2 rounded-lg border border-slate-200 bg-white p-3 text-sm"><div className="font-medium">{task.title}</div><div className="mt-2 flex items-center justify-between"><Badge tone={task.priority}>{pretty(task.priority)}</Badge><span className="text-xs text-slate-500">{date(task.dueDate)}</span></div><button className="table-action mt-2" onClick={() => setTaskEdit({ ...task, dueDate: task.dueDate?.slice?.(0, 10) })}><Edit3 size={14} /> Edit</button></div>)}</div>)}</div></div>{serviceEdit && <EditRecordModal title={serviceEdit.id ? "Edit Service" : "Add Service"} initial={serviceEdit} fields={[{ name: "clientId", label: "Client", options: clientOptions }, { name: "serviceType", label: "Service", options: ["SEO", "SMO", "SMM", "GOOGLE_ADS", "META_ADS", "WEBSITE", "GMB", "CONTENT", "GRAPHIC_DESIGN"] }, { name: "packageName", label: "Package" }, { name: "monthlyValue", label: "Monthly Value", kind: "number", type: "number" }, { name: "status", label: "Status", options: ["ACTIVE", "PAUSED", "COMPLETED"] }]} onSubmit={saveService} onClose={() => setServiceEdit(null)} />}{taskEdit && <EditRecordModal title={taskEdit.id ? "Edit Task" : "Add Task"} initial={taskEdit} fields={[{ name: "title", label: "Task Title" }, { name: "serviceOrderId", label: "Service Order ID" }, { name: "assignedToId", label: "Assigned To", options: ["u-owner", "u-am", "u-seo", "u-design"] }, { name: "priority", label: "Priority", options: ["LOW", "MEDIUM", "HIGH", "URGENT"] }, { name: "status", label: "Status", options: cols }, { name: "dueDate", label: "Due Date", type: "date" }]} onSubmit={saveTask} onClose={() => setTaskEdit(null)} />}</div>;
}
function ContentCalendar() {
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: () => api("/clients") });
  const [clientId, setClientId] = useState("c-1");
  const [editing, setEditing] = useState(null);
  const { data } = useQuery({ queryKey: ["calendar", clientId], queryFn: () => api(`/calendar?clientId=${clientId}&month=5&year=2026`) });
  const items = data?.data || [];
  async function saveItem(payload) { await api(editing?.id ? `/calendar/${editing.id}` : "/calendar", { method: editing?.id ? "PUT" : "POST", body: JSON.stringify({ ...payload, month: 5, year: 2026, scheduledDate: payload.scheduledDate ? new Date(payload.scheduledDate).toISOString() : new Date().toISOString() }) }); refreshCRM(); }
  async function bulkGenerate() { await api("/calendar/bulk", { method: "POST", body: JSON.stringify({ clientId, month: 5, year: 2026, count: 26, platform: "INSTAGRAM" }) }); refreshCRM(); }
  return <div className="space-y-4"><div className="toolbar"><select className="input max-w-xs" value={clientId} onChange={(e) => setClientId(e.target.value)}>{(clients?.data || []).map((client) => <option key={client.id} value={client.id}>{client.businessName}</option>)}</select><div className="flex gap-2"><button className="secondary-button" onClick={bulkGenerate}>Generate Month</button><button className="primary" onClick={() => setEditing({ clientId, platform: "INSTAGRAM", postType: "STATIC", status: "DRAFT" })}><Plus size={16} /> Add Post</button></div></div><div className="grid grid-cols-7 gap-2">{Array.from({ length: 31 }, (_, i) => i + 1).map((day) => <div key={day} className="min-h-28 rounded-lg border border-slate-200 bg-white p-2"><div className="text-xs font-semibold text-slate-500">{day}</div><div className="mt-2 space-y-1">{items.filter((item) => new Date(item.scheduledDate).getDate() === day).map((item) => <button key={item.id} onClick={() => setEditing({ ...item, scheduledDate: item.scheduledDate?.slice?.(0, 10) })} className="w-full rounded-md bg-emerald-50 px-2 py-1 text-left text-[11px] font-medium text-emerald-700">{pretty(item.platform)} · {pretty(item.status)}</button>)}</div></div>)}</div>{editing && <EditRecordModal title={editing.id ? "Edit Content" : "Add Content"} initial={editing} fields={[{ name: "clientId", label: "Client ID" }, { name: "platform", label: "Platform", options: ["INSTAGRAM", "FACEBOOK", "LINKEDIN", "YOUTUBE", "GMB"] }, { name: "postType", label: "Post Type", options: ["STATIC", "REEL", "CAROUSEL", "STORY", "BLOG"] }, { name: "scheduledDate", label: "Schedule Date", type: "date" }, { name: "status", label: "Status", options: ["DRAFT", "REVIEW", "APPROVED", "PUBLISHED"] }, { name: "caption", label: "Caption", rows: 3 }, { name: "designBrief", label: "Design Brief", rows: 3 }]} onSubmit={saveItem} onClose={() => setEditing(null)} />}</div>;
}
function Invoices() {
  const [editing, setEditing] = useState(null);
  const { data } = useQuery({ queryKey: ["invoices"], queryFn: () => api("/invoices") });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: () => api("/clients") });
  async function saveInvoice(payload) {
    const body = { clientId: payload.clientId, dueDate: new Date(payload.dueDate).toISOString(), gstAmount: payload.gstAmount, paidAmount: payload.paidAmount, status: payload.status, lineItems: [{ description: payload.description, amount: payload.amount }] };
    await api(editing?.id ? `/invoices/${editing.id}` : "/invoices", { method: editing?.id ? "PUT" : "POST", body: JSON.stringify(body) });
    refreshCRM();
  }
  async function markPaid(row) { await api(`/invoices/${row.id}/pay`, { method: "PUT", body: JSON.stringify({ paidAmount: row.totalAmount }) }); refreshCRM(); }
  function editInvoice(row) { setEditing({ ...row, description: row.lineItems?.[0]?.description || "Service", amount: row.lineItems?.[0]?.amount || row.amount || 0, dueDate: row.dueDate?.slice?.(0, 10) }); }
  return <div className="panel"><div className="toolbar"><h2 className="section-title">Invoices</h2><button className="primary" onClick={() => setEditing({ clientId: clients?.data?.[0]?.id, description: "Monthly retainer", amount: 0, gstAmount: 0, paidAmount: 0, status: "PENDING" })}><Plus size={16} /> Create Invoice</button></div><DataTable rows={data?.data || []} columns={["invoiceNumber", "client.businessName", "totalAmount", "status", "dueDate"]} action={(row) => <div className="flex flex-wrap gap-2"><button className="table-action" onClick={() => editInvoice(row)}><Edit3 size={14} /> Edit</button><a className="table-action" href={`${API_URL}/invoices/${row.id}/pdf`} target="_blank">PDF</a><button className="table-action" onClick={() => markPaid(row)} disabled={row.status === "PAID"}>Mark Paid</button></div>} />{editing && <EditRecordModal title={editing.id ? "Edit Invoice" : "Create Invoice"} initial={editing} fields={[{ name: "clientId", label: "Client", options: (clients?.data || []).map((c) => ({ value: c.id, label: c.businessName })) }, { name: "description", label: "Line Item" }, { name: "amount", label: "Amount", kind: "number", type: "number" }, { name: "gstAmount", label: "GST Amount", kind: "number", type: "number" }, { name: "paidAmount", label: "Paid Amount", kind: "number", type: "number" }, { name: "status", label: "Status", options: ["PENDING", "PARTIAL", "PAID", "OVERDUE"] }, { name: "dueDate", label: "Due Date", type: "date" }]} onSubmit={saveInvoice} onClose={() => setEditing(null)} />}</div>;
}
function Campaigns() {
  const [editing, setEditing] = useState(null);
  const { data } = useQuery({ queryKey: ["campaigns"], queryFn: () => api("/campaigns") });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: () => api("/clients") });
  async function saveCampaign(payload) { await api(editing?.id ? `/campaigns/${editing.id}` : "/campaigns", { method: editing?.id ? "PUT" : "POST", body: JSON.stringify({ ...payload, month: 5, year: 2026 }) }); refreshCRM(); }
  return <div className="grid gap-5 xl:grid-cols-[1fr_.8fr]"><div className="panel"><div className="toolbar"><h2 className="section-title">Campaign Performance</h2><button className="primary" onClick={() => setEditing({ clientId: clients?.data?.[0]?.id, platform: "INSTAGRAM", adSpend: 0, impressions: 0, clicks: 0, ctr: 0, leadsGenerated: 0, cpl: 0 })}><Plus size={16} /> Add Campaign</button></div><DataTable rows={data?.data || []} columns={["platform", "adSpend", "impressions", "clicks", "ctr", "leadsGenerated", "cpl"]} action={(row) => <button className="table-action" onClick={() => setEditing(row)}><Edit3 size={14} /> Edit</button>} /></div><div className="panel"><h2 className="section-title">SEO Keyword Tracker</h2><DataTable rows={data?.data?.[0]?.seoKeywords || []} columns={["keyword", "prev", "current"]} /></div>{editing && <EditRecordModal title={editing.id ? "Edit Campaign" : "Add Campaign"} initial={editing} fields={[{ name: "clientId", label: "Client", options: (clients?.data || []).map((c) => ({ value: c.id, label: c.businessName })) }, { name: "platform", label: "Platform", options: ["GOOGLE_ADS", "INSTAGRAM", "FACEBOOK", "LINKEDIN", "SEO"] }, { name: "adSpend", label: "Ad Spend", kind: "number", type: "number" }, { name: "impressions", label: "Impressions", kind: "number", type: "number" }, { name: "clicks", label: "Clicks", kind: "number", type: "number" }, { name: "ctr", label: "CTR", kind: "number", type: "number" }, { name: "leadsGenerated", label: "Leads Generated", kind: "number", type: "number" }, { name: "cpl", label: "CPL", kind: "number", type: "number" }]} onSubmit={saveCampaign} onClose={() => setEditing(null)} />}</div>;
}
function TeamWorkload() { const { data } = useQuery({ queryKey: ["workload"], queryFn: () => api("/tasks/workload") }); return <div className="panel"><h2 className="section-title">Team Workload</h2><div className="mt-4 space-y-3">{(data?.data || []).map((user) => { const pct = user.totalTasks ? Math.round(user.doneTasks / user.totalTasks * 100) : 0; return <div key={user.userId} className="rounded-lg border border-slate-200 p-3"><div className="flex items-center justify-between"><div><div className="font-semibold">{user.name}</div><div className="text-sm text-slate-500">{pretty(user.role)}</div></div><Badge tone={user.overdueTasks ? "OVERDUE" : "DONE"}>{user.overdueTasks} overdue</Badge></div><div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-emerald-600" style={{ width: `${pct}%` }} /></div></div>; })}</div></div>; }
function Portal() { return <div className="space-y-5"><div className="panel"><h2 className="section-title">Client Portal</h2><p className="text-sm text-slate-600">Reports, invoices, and content approvals are filtered to the signed-in client account.</p></div><Invoices /><ContentCalendar /></div>; }
function SettingsPage() {
  const stored = JSON.parse(localStorage.getItem("ob_settings") || "null");
  const [profile, setProfile] = useState(stored || { agencyName: "OptiBrandz Marketing Agency", address: "Vapi, Gujarat, India", whatsapp: "+91 00000 00000", email: "grow@optibrandz.in" });
  const [saved, setSaved] = useState(false);
  function saveSettings() {
    localStorage.setItem("ob_settings", JSON.stringify(profile));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }
  return <div className="grid gap-5 xl:grid-cols-2"><div className="panel"><h2 className="section-title">Agency Profile</h2><label className="field-label">Agency name</label><input className="input" value={profile.agencyName} onChange={(e) => setProfile({ ...profile, agencyName: e.target.value })} /><label className="field-label mt-4">Address</label><textarea className="input min-h-24" value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} /><label className="field-label mt-4">WhatsApp</label><input className="input" value={profile.whatsapp} onChange={(e) => setProfile({ ...profile, whatsapp: e.target.value })} /><label className="field-label mt-4">Email</label><input className="input" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /><button className="primary mt-4" onClick={saveSettings}><Save size={16} /> Save Settings</button>{saved && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">Settings saved on this browser.</div>}</div><div className="panel"><h2 className="section-title">System Readiness</h2>{["JWT auth", "Role guards", "Editable records", "Invoice PDF", "Daily notifications", "Responsive shell"].map((item) => <div key={item} className="flex items-center gap-2 border-b border-slate-100 py-3 text-sm"><CheckCircle2 size={17} className="text-emerald-600" />{item}</div>)}</div></div>;
}

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
