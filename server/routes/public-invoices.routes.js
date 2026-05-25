const express = require("express");
const PDFDocument = require("pdfkit");
const prisma = require("../db/prisma");
const asyncRoute = require("../utils/asyncRoute");

const router = express.Router();

router.get("/:id/pdf", asyncRoute(async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: { client: true } });
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=${invoice.invoiceNumber}.pdf`);
  const doc = new PDFDocument({ margin: 48 });
  doc.pipe(res);
  doc.fontSize(22).text("OptiBrandz", { continued: true }).fontSize(11).text("  Vapi, Gujarat");
  doc.moveDown().fontSize(18).text("Invoice");
  doc.fontSize(10).text(`Invoice: ${invoice.invoiceNumber}`).text(`Client: ${invoice.client?.businessName || "Client"}`).text(`Due: ${new Date(invoice.dueDate).toLocaleDateString()}`);
  doc.moveDown().fontSize(12).text("Line Items");
  invoice.lineItems.forEach((item) => doc.text(`${item.description} - INR ${Number(item.amount || 0).toLocaleString("en-IN")}`));
  doc.moveDown().fontSize(12).text(`GST: INR ${Number(invoice.gstAmount || 0).toLocaleString("en-IN")}`).fontSize(16).text(`Total: INR ${Number(invoice.totalAmount || 0).toLocaleString("en-IN")}`);
  doc.moveDown().fontSize(10).text("Bank details: OptiBrandz Marketing Agency | optibrandz.in | grow@optibrandz.in");
  doc.end();
}));

module.exports = router;
