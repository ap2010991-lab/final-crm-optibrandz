const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const requireRole = require("../middleware/requireRole");
const asyncRoute = require("../utils/asyncRoute");
const { onlyProvided } = require("../utils/onlyProvided");
const { streamInvoicePdf } = require("../utils/invoicePdf");
const { InvoiceStatus } = require("../utils/enums");
const { invoiceStatus, round, startOfToday } = require("../utils/invoiceStatus");
const { retainerClientsDue } = require("../utils/retainerRun");

const router = express.Router();

const money = z.number().min(0).max(1_000_000_000);
const invoiceSchema = z.object({
  clientId: z.string().min(1),
  lineItems: z.array(z.object({ description: z.string().min(1), amount: money })).min(1),
  dueDate: z.string().min(1),
  gstAmount: money.default(0),
  paidAmount: money.default(0),
  status: InvoiceStatus.optional(),
  clientPhone: z.string().max(30).optional().nullable(),
  notes: z.string().max(2000).optional().nullable()
});

function parseDueDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error("Enter a valid due date.");
    error.status = 422;
    throw error;
  }
  return date;
}

// The money is computed here; what the status should be is decided in one place for the
// write path, the nightly job and the dashboard alike (utils/invoiceStatus).
function invoiceTotals(body) {
  const amount = round((body.lineItems || []).reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const totalAmount = round(amount + Number(body.gstAmount || 0));
  const paidAmount = round(body.paidAmount);
  if (paidAmount > totalAmount) {
    const error = new Error("Paid amount cannot be more than the invoice total.");
    error.status = 422;
    throw error;
  }
  const status = invoiceStatus({ totalAmount, paidAmount, dueDate: body.dueDate, status: body.status });
  return { amount, totalAmount, paidAmount, status };
}

// Sorting invoice numbers as text ranks "OB-2026-999" above "OB-2026-1000", so past the
// 999th invoice of a year the next number was computed as one already taken, the unique
// constraint rejected it, and the retry recomputed the same number 25 times before
// giving up with a 500. The sequence is now compared as a number.
async function nextInvoiceNumber(year) {
  const prefix = `OB-${year}-`;
  const issued = await prisma.invoice.findMany({
    where: { invoiceNumber: { startsWith: prefix } },
    select: { invoiceNumber: true }
  });
  const highest = issued.reduce((max, { invoiceNumber }) => {
    const sequence = Number(invoiceNumber.slice(prefix.length));
    return Number.isFinite(sequence) && sequence > max ? sequence : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}

// On a unique-constraint collision the highest number is read again rather than skipped,
// so the series stays gapless for GST filing.
async function createInvoiceWithNumber(data, attempt = 0) {
  const invoiceNumber = await nextInvoiceNumber(new Date().getFullYear());
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

router.get("/run", asyncRoute(async (_req, res) => {
  const due = await retainerClientsDue();
  res.json({ data: due, total: round(due.reduce((sum, client) => sum + client.amount, 0)) });
}));

router.post("/run", asyncRoute(async (req, res) => {
  const { dueInDays = 7 } = z.object({ dueInDays: z.number().int().min(0).max(90).optional() }).parse(req.body || {});
  const due = await retainerClientsDue();
  if (!due.length) return res.json({ data: [], created: 0, message: "Every retainer client is already invoiced this month." });

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueInDays);
  const month = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  // Created one at a time on purpose: invoice numbers must stay unique and gapless, and
  // createInvoiceWithNumber retries against the highest number issued.
  const created = [];
  for (const client of due) {
    created.push(await createInvoiceWithNumber({
      clientId: client.id,
      clientPhone: client.phone,
      lineItems: [{ description: `Monthly retainer — ${month}`, amount: client.amount }],
      amount: client.amount,
      gstAmount: 0,
      totalAmount: client.amount,
      paidAmount: 0,
      status: "PENDING",
      dueDate,
      paidAt: null,
      isRetainer: true
    }));
  }
  res.status(201).json({ data: created, created: created.length });
}));

// Grouped by month name alone, August 2025 and August 2026 landed in the same row and
// the chart silently reported two years of billing as one month. Keyed by year+month,
// labelled with the year, and bounded to a rolling window so it stays cheap.
router.get("/revenue", asyncRoute(async (req, res) => {
  const months = Math.min(Math.max(Number(req.query.months) || 12, 1), 60);
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const invoices = await prisma.invoice.findMany({
    where: { createdAt: { gte: from }, status: { not: "CANCELLED" } },
    select: { totalAmount: true, paidAmount: true, createdAt: true },
    orderBy: { createdAt: "asc" }
  });

  // Every month in the window appears, so a gap reads as zero rather than vanishing.
  const buckets = Array.from({ length: months }, (_, index) => {
    const date = new Date(from.getFullYear(), from.getMonth() + index, 1);
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      month: date.toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
      invoiced: 0,
      collected: 0
    };
  });
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  invoices.forEach((invoice) => {
    const created = new Date(invoice.createdAt);
    const bucket = byKey.get(`${created.getFullYear()}-${created.getMonth()}`);
    if (!bucket) return;
    bucket.invoiced = round(bucket.invoiced + Number(invoice.totalAmount || 0));
    bucket.collected = round(bucket.collected + Number(invoice.paidAmount || 0));
  });

  res.json({ data: buckets.map(({ key, ...row }) => row) });
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
  const body = onlyProvided(req.body, invoiceSchema.partial().parse(req.body));
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
