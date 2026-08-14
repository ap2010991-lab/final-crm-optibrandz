const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const requireRole = require("../middleware/requireRole");
const asyncRoute = require("../utils/asyncRoute");
const { streamInvoicePdf } = require("../utils/invoicePdf");

const router = express.Router();

const money = z.number().min(0).max(1_000_000_000);
const invoiceSchema = z.object({
  clientId: z.string().min(1),
  lineItems: z.array(z.object({ description: z.string().min(1), amount: money })).min(1),
  dueDate: z.string().min(1),
  gstAmount: money.default(0),
  paidAmount: money.default(0),
  status: z.enum(["PENDING", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"]).optional(),
  clientPhone: z.string().max(30).optional().nullable(),
  notes: z.string().max(2000).optional().nullable()
});

const round = (value) => Math.round(Number(value || 0) * 100) / 100;

function parseDueDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error("Enter a valid due date.");
    error.status = 422;
    throw error;
  }
  return date;
}

// The invoice status is derived from the money, so a half-paid invoice can never be
// left sitting on PAID. An explicit CANCELLED is always respected.
function invoiceTotals(body) {
  const amount = round((body.lineItems || []).reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const totalAmount = round(amount + Number(body.gstAmount || 0));
  const paidAmount = round(body.paidAmount);
  if (paidAmount > totalAmount) {
    const error = new Error("Paid amount cannot be more than the invoice total.");
    error.status = 422;
    throw error;
  }
  let status = body.status === "CANCELLED"
    ? "CANCELLED"
    : paidAmount >= totalAmount && totalAmount > 0 ? "PAID"
      : paidAmount > 0 ? "PARTIAL"
        : "PENDING";
  if (status === "PENDING" && body.dueDate && new Date(body.dueDate) < startOfToday()) status = "OVERDUE";
  return { amount, totalAmount, paidAmount, status };
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

// `count() + 1` produced duplicate numbers when two invoices were created together and
// re-used numbers after a delete. The number is now derived from the highest number
// already issued this year. On a unique-constraint collision the highest number is read
// again rather than skipped, so the series stays gapless for GST filing.
async function createInvoiceWithNumber(data, attempt = 0) {
  const year = new Date().getFullYear();
  const prefix = `OB-${year}-`;
  const latest = await prisma.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true }
  });
  const lastSequence = latest ? Number(latest.invoiceNumber.slice(prefix.length)) || 0 : 0;
  const invoiceNumber = `${prefix}${String(lastSequence + 1).padStart(3, "0")}`;
  try {
    return await prisma.invoice.create({ data: { ...data, invoiceNumber } });
  } catch (error) {
    if (error.code === "P2002" && attempt < 25) {
      await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1)));
      return createInvoiceWithNumber(data, attempt + 1);
    }
    throw error;
  }
}

function clientScope(user) {
  return user.role === "CLIENT" ? { clientId: user.clientId || "__none__" } : {};
}

router.get("/", asyncRoute(async (req, res) => {
  const data = await prisma.invoice.findMany({
    where: {
      ...clientScope(req.user),
      ...(req.query.clientId ? { clientId: String(req.query.clientId) } : {}),
      ...(req.query.status ? { status: String(req.query.status) } : {})
    },
    include: { client: { select: { id: true, businessName: true, contactPerson: true, phone: true, email: true } } },
    orderBy: { createdAt: "desc" }
  });
  res.json({ data });
}));

router.get("/revenue", asyncRoute(async (_req, res) => {
  const invoices = await prisma.invoice.findMany({ orderBy: { createdAt: "asc" } });
  const data = invoices.reduce((acc, invoice) => {
    const month = new Date(invoice.createdAt).toLocaleDateString("en-IN", { month: "short" });
    const row = acc.find((item) => item.month === month) || acc[acc.push({ month, invoiced: 0, collected: 0 }) - 1];
    row.invoiced += Number(invoice.totalAmount || 0);
    row.collected += Number(invoice.paidAmount || 0);
    return acc;
  }, []);
  res.json({ data });
}));

router.post("/", asyncRoute(async (req, res) => {
  const body = invoiceSchema.parse(req.body);
  const client = await prisma.client.findUnique({ where: { id: body.clientId } });
  if (!client) return res.status(422).json({ message: "Choose a client for this invoice." });
  const totals = invoiceTotals(body);
  const invoice = await createInvoiceWithNumber({
    ...body,
    ...totals,
    dueDate: parseDueDate(body.dueDate),
    paidAt: totals.status === "PAID" ? new Date() : null
  });
  res.status(201).json({ data: invoice });
}));

router.get("/:id", asyncRoute(async (req, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, ...clientScope(req.user) },
    include: { client: true }
  });
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });
  res.json({ data: invoice });
}));

router.put("/:id", asyncRoute(async (req, res) => {
  const body = invoiceSchema.partial().parse(req.body);
  const current = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Invoice not found" });
  const merged = {
    ...current,
    ...body,
    lineItems: body.lineItems || current.lineItems,
    gstAmount: body.gstAmount ?? current.gstAmount,
    paidAmount: body.paidAmount ?? current.paidAmount,
    dueDate: body.dueDate || current.dueDate
  };
  const totals = invoiceTotals(merged);
  const invoice = await prisma.invoice.update({
    where: { id: req.params.id },
    data: {
      ...body,
      ...totals,
      ...(body.dueDate ? { dueDate: parseDueDate(body.dueDate) } : {}),
      paidAt: totals.status === "PAID" ? current.paidAt || new Date() : null
    }
  });
  res.json({ data: invoice });
}));

router.put("/:id/pay", asyncRoute(async (req, res) => {
  const current = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Invoice not found" });
  const { paidAmount } = z.object({ paidAmount: money }).parse(req.body);
  const totals = invoiceTotals({ ...current, paidAmount, lineItems: current.lineItems });
  const invoice = await prisma.invoice.update({
    where: { id: req.params.id },
    data: { paidAmount: totals.paidAmount, status: totals.status, paidAt: totals.status === "PAID" ? current.paidAt || new Date() : null }
  });
  res.json({ data: invoice });
}));

router.delete("/:id", requireRole(["OWNER"]), asyncRoute(async (req, res) => {
  const current = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Invoice not found" });
  await prisma.invoice.delete({ where: { id: req.params.id } });
  res.json({ data: current });
}));

router.get("/:id/pdf", asyncRoute(async (req, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, ...clientScope(req.user) },
    include: { client: true }
  });
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });
  await streamInvoicePdf(invoice, res);
}));

module.exports = router;
