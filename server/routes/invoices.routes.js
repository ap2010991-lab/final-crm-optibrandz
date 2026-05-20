const express = require("express");
const PDFDocument = require("pdfkit");
const { z } = require("zod");
const { invoices, clients } = require("../data");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();
router.use(verifyToken);

router.get("/", (req, res) => {
  const data = invoices.filter((invoice) =>
    (!req.query.clientId || invoice.clientId === req.query.clientId) &&
    (!req.query.status || invoice.status === req.query.status)
  ).map((invoice) => ({ ...invoice, client: clients.find((client) => client.id === invoice.clientId) }));
  res.json({ data });
});

router.post("/", (req, res) => {
  const body = z.object({ clientId: z.string(), lineItems: z.array(z.object({ description: z.string(), amount: z.number() })), dueDate: z.string(), gstAmount: z.number().default(0), notes: z.string().optional() }).parse(req.body);
  const amount = body.lineItems.reduce((sum, item) => sum + item.amount, 0);
  const invoice = {
    id: `i-${Date.now()}`,
    invoiceNumber: `OB-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(3, "0")}`,
    amount,
    totalAmount: amount + body.gstAmount,
    paidAmount: 0,
    status: "PENDING",
    ...body
  };
  invoices.unshift(invoice);
  res.status(201).json({ data: invoice });
});

router.get("/revenue", (_req, res) => {
  const data = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May"].map((month, index) => ({
    month,
    invoiced: 45000 + index * 7000,
    collected: 38000 + index * 6200
  }));
  res.json({ data });
});

router.get("/:id", (req, res) => {
  const invoice = invoices.find((item) => item.id === req.params.id);
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });
  res.json({ data: { ...invoice, client: clients.find((client) => client.id === invoice.clientId) } });
});

router.put("/:id/pay", (req, res) => {
  const invoice = invoices.find((item) => item.id === req.params.id);
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });
  const { paidAmount } = z.object({ paidAmount: z.number() }).parse(req.body);
  invoice.paidAmount = paidAmount;
  invoice.status = paidAmount >= invoice.totalAmount ? "PAID" : paidAmount > 0 ? "PARTIAL" : "PENDING";
  if (invoice.status === "PAID") invoice.paidAt = new Date().toISOString();
  res.json({ data: invoice });
});

router.get("/:id/pdf", (req, res) => {
  const invoice = invoices.find((item) => item.id === req.params.id);
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });
  const client = clients.find((item) => item.id === invoice.clientId);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=${invoice.invoiceNumber}.pdf`);
  const doc = new PDFDocument({ margin: 48 });
  doc.pipe(res);
  doc.fontSize(22).text("OptiBrandz", { continued: true }).fontSize(11).text("  Vapi, Gujarat");
  doc.moveDown().fontSize(18).text("Invoice");
  doc.fontSize(10).text(`Invoice: ${invoice.invoiceNumber}`).text(`Client: ${client?.businessName || "Client"}`).text(`Due: ${new Date(invoice.dueDate).toLocaleDateString()}`);
  doc.moveDown().fontSize(12).text("Line Items");
  invoice.lineItems.forEach((item) => doc.text(`${item.description} - INR ${item.amount.toLocaleString("en-IN")}`));
  doc.moveDown().fontSize(12).text(`GST: INR ${invoice.gstAmount.toLocaleString("en-IN")}`).fontSize(16).text(`Total: INR ${invoice.totalAmount.toLocaleString("en-IN")}`);
  doc.moveDown().fontSize(10).text("Bank details: OptiBrandz Marketing Agency | optibrandz.in | grow@optibrandz.in");
  doc.end();
});

module.exports = router;
