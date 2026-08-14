const PDFDocument = require("pdfkit");
const { getAgencySettings } = require("./agencySettings");

const inr = (value) => `INR ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (value) => (value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-");

function lineItemsOf(invoice) {
  const items = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
  if (items.length) return items;
  return [{ description: "Services", amount: invoice.amount }];
}

/**
 * Streams an invoice PDF to `res`. Both the authenticated download and the public
 * WhatsApp share link render the same document, and both use the agency profile
 * saved in Settings rather than hard-coded text.
 */
async function streamInvoicePdf(invoice, res) {
  const agency = await getAgencySettings();
  const safeNumber = String(invoice.invoiceNumber || "invoice").replace(/[^A-Za-z0-9._-]/g, "-");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${safeNumber}.pdf"`);

  const doc = new PDFDocument({ margin: 48, size: "A4" });
  doc.on("error", () => res.end());
  doc.pipe(res);

  doc.fontSize(22).text(agency.agencyName || "OptiBrandz");
  doc.fontSize(10).fillColor("#555");
  if (agency.address) doc.text(agency.address);
  const contactLine = [agency.phone || agency.whatsapp, agency.email, agency.website].filter(Boolean).join("  |  ");
  if (contactLine) doc.text(contactLine);
  if (agency.gstNumber) doc.text(`GSTIN: ${agency.gstNumber}`);

  doc.moveDown(1.2).fillColor("#000").fontSize(18).text("Invoice");
  doc.moveDown(0.4).fontSize(10);
  doc.text(`Invoice number: ${invoice.invoiceNumber}`);
  doc.text(`Date: ${day(invoice.createdAt)}`);
  doc.text(`Due date: ${day(invoice.dueDate)}`);
  doc.text(`Status: ${invoice.status}`);

  doc.moveDown(0.8).fontSize(12).text("Bill to");
  doc.fontSize(10).fillColor("#333");
  doc.text(invoice.client?.businessName || "Client");
  if (invoice.client?.contactPerson) doc.text(invoice.client.contactPerson);
  const clientContact = [invoice.clientPhone || invoice.client?.phone, invoice.client?.email].filter(Boolean).join("  |  ");
  if (clientContact) doc.text(clientContact);
  if (invoice.client?.gstNumber) doc.text(`GSTIN: ${invoice.client.gstNumber}`);

  doc.moveDown(0.9).fillColor("#000").fontSize(12).text("Line items");
  doc.moveDown(0.3).fontSize(10);
  lineItemsOf(invoice).forEach((item) => {
    doc.text(`${item.description || "Service"}`, { continued: true }).text(inr(item.amount), { align: "right" });
  });

  doc.moveDown(0.8).fontSize(10);
  doc.text("Subtotal", { continued: true }).text(inr(invoice.amount), { align: "right" });
  doc.text("GST", { continued: true }).text(inr(invoice.gstAmount), { align: "right" });
  doc.fontSize(14).text("Total", { continued: true }).text(inr(invoice.totalAmount), { align: "right" });
  doc.fontSize(10).text("Paid", { continued: true }).text(inr(invoice.paidAmount), { align: "right" });
  doc.text("Balance due", { continued: true })
    .text(inr(Math.max(Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0), 0)), { align: "right" });

  if (invoice.notes || agency.invoiceNotes) {
    doc.moveDown(1).fontSize(10).fillColor("#555").text(invoice.notes || agency.invoiceNotes);
  }
  if (agency.bankDetails && typeof agency.bankDetails === "object") {
    doc.moveDown(0.8).fillColor("#000").fontSize(11).text("Payment details");
    doc.fontSize(10).fillColor("#555");
    Object.entries(agency.bankDetails).forEach(([key, value]) => doc.text(`${key}: ${value}`));
  }

  doc.end();
}

module.exports = { streamInvoicePdf };
