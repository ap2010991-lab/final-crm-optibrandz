import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, FileText, IndianRupee, MessageCircle, Plus, Trash2 } from "lucide-react";
import { api, useAuth, PUBLIC_BASE } from "../lib/api";
import { longDate, money, normalizePhone, pretty, toDateInput } from "../lib/format";
import { QueryState } from "../components/QueryState";
import Modal from "../components/Modal";
import { ConfirmModal } from "../components/RecordModal";
import DataTable from "../components/DataTable";
import Badge from "../components/Badge";
import { useToast } from "../lib/useToast";

const STATUSES = ["PENDING", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"];

export default function Invoices({ readOnly = false }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [paying, setPaying] = useState(null);

  const query = useQuery({ queryKey: ["invoices"], queryFn: () => api("/invoices") });
  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: () => api("/clients"), enabled: !readOnly });
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: () => api("/settings") });

  const invoices = query.data?.data || [];
  const clients = clientsQuery.data?.data || [];
  const agency = settingsQuery.data?.data;
  const canDelete = user?.role === "OWNER" && !readOnly;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  function pdfUrl(invoice) {
    return `${PUBLIC_BASE}/api/public/invoices/${invoice.id}/pdf`;
  }

  function whatsappUrl(invoice) {
    const phone = normalizePhone(invoice.clientPhone || invoice.client?.phone);
    if (!phone) return "";
    const from = agency?.agencyName || "OptiBrandz";
    const text = `Hello ${invoice.client?.contactPerson || invoice.client?.businessName || "there"}, `
      + `invoice ${invoice.invoiceNumber} from ${from} is ready.\n`
      + `Amount: ${money(invoice.totalAmount)}\n`
      + `Due date: ${longDate(invoice.dueDate)}\n`
      + `PDF: ${pdfUrl(invoice)}`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }

  async function deleteInvoice(invoice) {
    await api(`/invoices/${invoice.id}`, { method: "DELETE" });
    notify(`Invoice ${invoice.invoiceNumber} deleted.`);
    refresh();
  }

  const actions = (row) => <div className="flex flex-wrap gap-2">
    {!readOnly && <button className="table-action" onClick={() => setEditing(row)}><Edit3 size={14} /> Edit</button>}
    <a className="table-action" href={pdfUrl(row)} target="_blank" rel="noopener noreferrer"><FileText size={14} /> PDF</a>
    {whatsappUrl(row)
      ? <a className="whatsapp-action" href={whatsappUrl(row)} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> Send</a>
      : <span className="table-action opacity-50">No phone</span>}
    {!readOnly && !["PAID", "CANCELLED"].includes(row.status) &&
      <button className="table-action" onClick={() => setPaying(row)}><IndianRupee size={14} /> Record payment</button>}
    {canDelete && <button className="danger-action" onClick={() => setDeleting(row)}><Trash2 size={14} /> Delete</button>}
  </div>;

  return <div className="space-y-4">
    <div className="toolbar">
      <h2 className="section-title">Invoices</h2>
      {!readOnly && <button className="primary" disabled={!clients.length} onClick={() => setEditing({ isNew: true })}>
        <Plus size={16} /> Create invoice
      </button>}
    </div>

    {!readOnly && clientsQuery.isSuccess && !clients.length &&
      <p className="empty-state">Add a client first — an invoice has to be billed to someone.</p>}

    <div className="panel">
      <QueryState query={query} label="invoices">
        <DataTable
          rows={invoices}
          columns={[
            { key: "invoiceNumber", label: "Invoice" },
            { key: "client.businessName", label: "Client" },
            { key: "totalAmount", label: "Total" },
            { key: "paidAmount", label: "Paid" },
            "status",
            { key: "dueDate", label: "Due" }
          ]}
          title={(row) => <span className="flex items-center justify-between gap-2">
            <span>{row.invoiceNumber}</span><Badge tone={row.status}>{pretty(row.status)}</Badge>
          </span>}
          action={actions}
          emptyMessage="No invoices yet."
        />
      </QueryState>
    </div>

    {editing && <InvoiceModal
      invoice={editing.isNew ? null : editing}
      clients={clients}
      onClose={() => setEditing(null)}
      onSaved={refresh}
    />}
    {paying && <PaymentModal invoice={paying} onClose={() => setPaying(null)} onSaved={refresh} />}
    {deleting && <ConfirmModal
      title="Delete invoice"
      message={`Delete invoice ${deleting.invoiceNumber} for ${deleting.client?.businessName || "this client"}? This cannot be undone. If it was raised in error, consider marking it Cancelled instead so your invoice numbering stays intact for GST.`}
      confirmLabel="Delete invoice"
      onConfirm={() => deleteInvoice(deleting)}
      onClose={() => setDeleting(null)}
    />}
  </div>;
}

const emptyLine = () => ({ description: "", amount: "" });

// Invoices used to be limited to a single line item, because the form flattened
// everything into one description/amount pair and overwrote the rest on every edit.
function InvoiceModal({ invoice, clients, onClose, onSaved }) {
  const { notify } = useToast();
  const [form, setForm] = useState(() => ({
    clientId: invoice?.clientId || clients[0]?.id || "",
    clientPhone: invoice?.clientPhone || invoice?.client?.phone || clients[0]?.phone || "",
    dueDate: toDateInput(invoice?.dueDate) || toDateInput(new Date(Date.now() + 7 * 86400000)),
    gstAmount: invoice?.gstAmount ?? 0,
    paidAmount: invoice?.paidAmount ?? 0,
    status: invoice?.status || "PENDING",
    notes: invoice?.notes || ""
  }));
  const [lines, setLines] = useState(() => {
    const existing = Array.isArray(invoice?.lineItems) ? invoice.lineItems : [];
    return existing.length ? existing.map((item) => ({ description: item.description || "", amount: item.amount ?? "" })) : [emptyLine()];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const subtotal = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const total = subtotal + Number(form.gstAmount || 0);

  function setLine(index, patch) {
    setLines((current) => current.map((line, position) => (position === index ? { ...line, ...patch } : line)));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    const cleaned = lines
      .map((line) => ({ description: line.description.trim(), amount: Number(line.amount || 0) }))
      .filter((line) => line.description || line.amount);

    if (!form.clientId) return setError("Choose a client.");
    if (!cleaned.length) return setError("Add at least one line item.");
    if (cleaned.some((line) => !line.description)) return setError("Every line item needs a description.");
    if (cleaned.some((line) => line.amount < 0)) return setError("Line amounts cannot be negative.");
    if (!form.dueDate) return setError("Choose a due date.");
    if (Number(form.paidAmount || 0) > total) return setError("Paid amount cannot be more than the invoice total.");

    setSaving(true);
    try {
      const body = {
        clientId: form.clientId,
        clientPhone: form.clientPhone || null,
        dueDate: form.dueDate,
        gstAmount: Number(form.gstAmount || 0),
        paidAmount: Number(form.paidAmount || 0),
        status: form.status,
        notes: form.notes || null,
        lineItems: cleaned
      };
      await api(invoice ? `/invoices/${invoice.id}` : "/invoices", {
        method: invoice ? "PUT" : "POST",
        body: JSON.stringify(body)
      });
      notify(invoice ? "Invoice updated." : "Invoice created.");
      onSaved();
      onClose();
    } catch (err) {
      setError(err?.message || "Could not save the invoice.");
    } finally {
      setSaving(false);
    }
  }

  return <Modal title={invoice ? `Edit ${invoice.invoiceNumber}` : "Create invoice"} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="field-label">Client <span className="text-[#be123c]">*</span></span>
          <select className="input" value={form.clientId} onChange={(event) => {
            const chosen = clients.find((client) => client.id === event.target.value);
            setForm((current) => ({ ...current, clientId: event.target.value, clientPhone: chosen?.phone || current.clientPhone }));
          }}>
            <option value="">Choose a client</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.businessName}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Client WhatsApp number</span>
          <input className="input" type="tel" inputMode="tel" value={form.clientPhone || ""}
            onChange={(event) => setForm({ ...form, clientPhone: event.target.value })} />
        </label>
      </div>

      <div>
        <span className="field-label">Line items <span className="text-[#be123c]">*</span></span>
        <div className="space-y-2">
          {lines.map((line, index) => <div key={index} className="line-item">
            <input className="input" placeholder="Description, e.g. Monthly SMM retainer" value={line.description}
              onChange={(event) => setLine(index, { description: event.target.value })} />
            <input className="input line-amount" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0"
              value={line.amount} onChange={(event) => setLine(index, { amount: event.target.value })} />
            <button type="button" className="icon-button shrink-0" aria-label="Remove line"
              disabled={lines.length === 1}
              onClick={() => setLines((current) => current.filter((_, position) => position !== index))}>
              <Trash2 size={16} />
            </button>
          </div>)}
        </div>
        <button type="button" className="secondary-button mt-2" onClick={() => setLines((current) => [...current, emptyLine()])}>
          <Plus size={15} /> Add line
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="field-label">GST amount</span>
          <input className="input" type="number" inputMode="decimal" min="0" step="0.01" value={form.gstAmount}
            onChange={(event) => setForm({ ...form, gstAmount: event.target.value })} />
        </label>
        <label className="block">
          <span className="field-label">Already paid</span>
          <input className="input" type="number" inputMode="decimal" min="0" step="0.01" value={form.paidAmount}
            onChange={(event) => setForm({ ...form, paidAmount: event.target.value })} />
        </label>
        <label className="block">
          <span className="field-label">Due date <span className="text-[#be123c]">*</span></span>
          <input className="input" type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} />
        </label>
        <label className="block">
          <span className="field-label">Status</span>
          <select className="input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            {STATUSES.map((status) => <option key={status} value={status}>{pretty(status)}</option>)}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="field-label">Notes on the invoice</span>
        <textarea className="input" rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      </label>

      <div className="totals-box">
        <div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
        <div><span>GST</span><strong>{money(form.gstAmount)}</strong></div>
        <div className="total"><span>Total</span><strong>{money(total)}</strong></div>
        <div><span>Balance due</span><strong>{money(Math.max(total - Number(form.paidAmount || 0), 0))}</strong></div>
      </div>

      {error && <div className="form-error">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="primary" disabled={saving}>{saving ? "Saving..." : invoice ? "Save invoice" : "Create invoice"}</button>
      </div>
    </form>
  </Modal>;
}

// "Mark paid" always wrote the full amount, so a part payment could not be recorded.
function PaymentModal({ invoice, onClose, onSaved }) {
  const { notify } = useToast();
  const outstanding = Math.max(Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0), 0);
  const [amount, setAmount] = useState(String(outstanding));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    const received = Number(amount || 0);
    const totalPaid = Number(invoice.paidAmount || 0) + received;
    if (received <= 0) return setError("Enter the amount received.");
    if (totalPaid > Number(invoice.totalAmount || 0)) return setError("That is more than the balance due.");

    setSaving(true);
    try {
      await api(`/invoices/${invoice.id}/pay`, { method: "PUT", body: JSON.stringify({ paidAmount: totalPaid }) });
      notify(`Payment of ${money(received)} recorded.`);
      onSaved();
      onClose();
    } catch (err) {
      setError(err?.message || "Could not record the payment.");
      setSaving(false);
    }
  }

  return <Modal title={`Record payment · ${invoice.invoiceNumber}`} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <div className="totals-box">
        <div><span>Invoice total</span><strong>{money(invoice.totalAmount)}</strong></div>
        <div><span>Already paid</span><strong>{money(invoice.paidAmount)}</strong></div>
        <div className="total"><span>Balance due</span><strong>{money(outstanding)}</strong></div>
      </div>
      <label className="block">
        <span className="field-label">Amount received now</span>
        <input className="input" type="number" inputMode="decimal" min="0" step="0.01" value={amount}
          onChange={(event) => setAmount(event.target.value)} autoFocus />
      </label>
      {error && <div className="form-error">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="primary" disabled={saving}>{saving ? "Saving..." : "Record payment"}</button>
      </div>
    </form>
  </Modal>;
}
