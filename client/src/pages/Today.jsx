import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CalendarPlus, CheckCircle2, ChevronRight, IndianRupee, MessageCircle, Receipt } from "lucide-react";
import { api, useAuth, PUBLIC_BASE } from "../lib/api";
import { longDate, money, normalizePhone, pretty, shortDate } from "../lib/format";
import { CONTENT_STAGES, normalizeStage, stageOf } from "../lib/contentStages";
import { QueryState } from "../components/QueryState";
import { useToast } from "../lib/useToast";

/**
 * The one screen that answers "what do I do now".
 *
 * The CRM had eleven sections and no answer to that question, so it got filled in and
 * never worked. Everything here is actionable in one tap; nothing is a number to admire.
 */
export default function Today() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [busy, setBusy] = useState("");

  const query = useQuery({ queryKey: ["today"], queryFn: () => api("/today") });
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: () => api("/settings") });
  const d = query.data?.data;
  const agency = settingsQuery.data?.data;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["today"] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  async function runBilling() {
    setBusy("billing");
    try {
      const result = await api("/invoices/run", { method: "POST", body: JSON.stringify({}) });
      notify(result.created ? `${result.created} invoice${result.created === 1 ? "" : "s"} raised.` : result.message);
      refresh();
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy("");
    }
  }

  async function advance(item) {
    const stage = stageOf(normalizeStage(item.status));
    if (!stage.next) return;
    setBusy(`content-${item.id}`);
    try {
      await api(`/calendar/${item.id}`, { method: "PUT", body: JSON.stringify({ status: stage.next }) });
      notify(`${item.client?.businessName || "Post"} → ${stageOf(stage.next).label}`);
      refresh();
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy("");
    }
  }

  function chaseUrl(invoice) {
    const phone = normalizePhone(invoice.clientPhone || invoice.client?.phone);
    if (!phone) return "";
    const from = agency?.agencyName || "OptiBrandz";
    const text = `Hello ${invoice.client?.contactPerson || invoice.client?.businessName || "there"}, `
      + `a gentle reminder that invoice ${invoice.invoiceNumber} from ${from} is still open.\n`
      + `Amount due: ${money(invoice.balance)}\n`
      + `Due date was: ${longDate(invoice.dueDate)}\n`
      + `PDF: ${PUBLIC_BASE}/api/public/invoices/${invoice.id}/pdf`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }

  const firstName = user?.name?.split(" ")[0] || "there";
  const nothingToDo = d
    && !d.money.toRaise.length && !d.money.overdue.length
    && !d.content.due.length
    && !(d.slipping.shortfalls || []).length
    && !d.slipping.noContentPlanned.length && !d.slipping.renewals.length && !d.slipping.staleLeads.length;

  return <div className="space-y-5">
    <section className="hero-panel">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ffd84d]">
        {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
      </p>
      <h2 className="mt-2 text-2xl font-black tracking-tight lg:text-3xl">Morning, {firstName}.</h2>
      {d && <p className="mt-3 text-sm leading-6 text-white/70">
        {nothingToDo
          ? "Nothing needs you right now. Everything is invoiced, planned and on time."
          : [
              d.money.toRaise.length ? `${d.money.toRaise.length} invoice${d.money.toRaise.length === 1 ? "" : "s"} to raise` : null,
              d.money.overdue.length ? `${d.money.overdue.length} payment${d.money.overdue.length === 1 ? "" : "s"} to chase` : null,
              d.content.due.length ? `${d.content.due.length} post${d.content.due.length === 1 ? "" : "s"} to move` : null
            ].filter(Boolean).join(" · ")}
      </p>}
    </section>

    <QueryState query={query} label="today">
      {d && <>
        {nothingToDo && <div className="empty-state">
          <h3>You&rsquo;re clear</h3>
          <p>No invoices to raise, nothing overdue, and every scheduled post is up to date.</p>
        </div>}

        {(d.money.toRaise.length > 0 || d.money.overdue.length > 0) && <div className="panel">
          <div className="toolbar-inline">
            <h2 className="section-title flex items-center gap-2"><IndianRupee size={16} className="text-[#ff7a18]" /> Money</h2>
          </div>

          {d.money.toRaise.length > 0 && <div className="mt-3 rounded-xl border border-[#e5e0d6] bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black">
                  {d.money.toRaise.length} retainer invoice{d.money.toRaise.length === 1 ? "" : "s"} to raise
                </div>
                <div className="text-xs font-bold text-zinc-500">{money(d.money.toRaiseTotal)} this month</div>
              </div>
              <button className="primary" onClick={runBilling} disabled={busy === "billing"}>
                <Receipt size={16} /> {busy === "billing" ? "Raising..." : "Raise all"}
              </button>
            </div>
            <div className="mt-3 space-y-1">
              {d.money.toRaise.map((client) => <div key={client.id} className="record-row">
                <dt className="truncate">{client.businessName}</dt>
                <dd>{money(client.amount)}</dd>
              </div>)}
            </div>
          </div>}

          {d.money.overdue.length > 0 && <div className="mt-3">
            <div className="text-xs font-black uppercase tracking-wide text-zinc-500">
              Overdue · {money(d.money.overdueTotal)}
            </div>
            <div className="mt-2 space-y-2">
              {d.money.overdue.map((invoice) => <div key={invoice.id} className="record-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-black">{invoice.client?.businessName || "Client"}</div>
                    <div className="text-xs font-bold text-zinc-500">
                      {invoice.invoiceNumber} · due {shortDate(invoice.dueDate)}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-black text-[#be123c]">{money(invoice.balance)}</div>
                </div>
                <div className="record-card-actions">
                  {chaseUrl(invoice)
                    ? <a className="whatsapp-action" href={chaseUrl(invoice)} target="_blank" rel="noopener noreferrer">
                        <MessageCircle size={14} /> Chase on WhatsApp
                      </a>
                    : <span className="table-action opacity-50">No phone</span>}
                  <Link className="table-action" to="/invoices">Open invoice</Link>
                </div>
              </div>)}
            </div>
          </div>}
        </div>}

        {d.content.due.length > 0 && <div className="panel">
          <h2 className="section-title flex items-center gap-2">
            <CalendarPlus size={16} className="text-[#ff7a18]" /> Content to move
          </h2>
          <p className="mt-1 text-xs font-semibold text-zinc-500">Scheduled today or this week and not posted yet.</p>
          <div className="mt-3 space-y-2">
            {d.content.due.map((item) => {
              const stage = stageOf(normalizeStage(item.status));
              return <div key={item.id} className="record-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-black">{item.client?.businessName || "Client"}</div>
                    <div className="text-xs font-bold text-zinc-500">
                      {pretty(item.platform)} · {pretty(item.postType)} ·{" "}
                      <span className={item.overdue ? "text-[#be123c]" : ""}>{shortDate(item.scheduledDate)}</span>
                    </div>
                  </div>
                  <StageChip status={item.status} />
                </div>
                {item.caption && <p className="mt-2 line-clamp-2 text-sm text-zinc-600">{item.caption}</p>}
                {stage.next && <button
                  className="primary mt-3 w-full"
                  onClick={() => advance(item)}
                  disabled={busy === `content-${item.id}`}
                >
                  <ArrowRight size={16} /> {busy === `content-${item.id}` ? "Saving..." : stage.action}
                </button>}
              </div>;
            })}
          </div>
        </div>}

        {(d.slipping.shortfalls?.length > 0) && <div className="panel">
          <h2 className="section-title">Behind on delivery</h2>
          <p className="mt-1 text-xs font-semibold text-zinc-500">Fewer posts planned this month than you committed to.</p>
          <div className="mt-3 space-y-2">
            {d.slipping.shortfalls.map((client) => {
              const pct = Math.min(100, Math.round((client.planned / client.target) * 100));
              return <Link key={client.id} to="/content" className="record-card block">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-black">{client.businessName}</div>
                    <div className="text-xs font-bold text-zinc-500">
                      {client.posted} posted · {client.planned} planned of {client.target} owed
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-black text-[#be123c]">
                    {client.target - client.planned} short
                  </span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-[#ff7a18]" style={{ width: `${pct}%` }} />
                </div>
              </Link>;
            })}
          </div>
        </div>}

        {(d.slipping.noContentPlanned.length > 0 || d.slipping.renewals.length > 0 || d.slipping.staleLeads.length > 0) &&
          <div className="panel">
            <h2 className="section-title">Slipping</h2>
            <div className="mt-3 space-y-2">
              {d.slipping.noContentPlanned.map((client) => <Link key={`c-${client.id}`} to="/content" className="dashboard-list-row">
                <span className="truncate">{client.businessName} — nothing planned this month</span>
                <ChevronRight size={15} className="shrink-0 text-zinc-400" />
              </Link>)}
              {d.slipping.renewals.map((client) => <Link key={`r-${client.id}`} to={`/clients/${client.id}`} className="dashboard-list-row">
                <span className="truncate">{client.businessName} renews {shortDate(client.renewalDate)}</span>
                <ChevronRight size={15} className="shrink-0 text-zinc-400" />
              </Link>)}
              {d.slipping.staleLeads.map((lead) => <Link key={`l-${lead.id}`} to={`/leads/${lead.id}`} className="dashboard-list-row">
                <span className="truncate">Follow up {lead.businessName || lead.name}</span>
                <ChevronRight size={15} className="shrink-0 text-zinc-400" />
              </Link>)}
            </div>
          </div>}
      </>}
    </QueryState>
  </div>;
}

export function StageChip({ status }) {
  const stage = stageOf(normalizeStage(status));
  const tone = {
    DRAFT: "bg-zinc-100 text-zinc-600 border-zinc-200",
    IN_DESIGN: "bg-blue-100 text-blue-700 border-blue-200",
    APPROVED: "bg-amber-100 text-amber-800 border-amber-200",
    PUBLISHED: "bg-emerald-100 text-emerald-700 border-emerald-200"
  }[stage.value];
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold ${tone}`}>
    {stage.value === "PUBLISHED" && <CheckCircle2 size={12} />}
    {stage.label}
  </span>;
}

export { CONTENT_STAGES };
