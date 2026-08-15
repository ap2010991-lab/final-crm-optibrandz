const PDFDocument = require("pdfkit");
const { getAgencySettings } = require("./agencySettings");
const {
  PAGE, COLORS, STATUS_TONES,
  applyFonts, currency, longDate, amountInWords, rule, pill
} = require("./pdfTheme");

function lineItemsOf(invoice) {
  const items = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
  if (items.length) return items;
  return [{ description: "Services", amount: invoice.amount }];
}

/**
 * Renders the invoice PDF.
 *
 * This is the one artefact a client actually receives, so it is laid out as a proper GST
 * tax invoice: a branded header band, From/Bill-to blocks carrying both GSTINs, a ruled
 * line-item table, an emphasised totals panel, the amount in words, and a signature
 * block. The previous version was a column of unstyled text with "INR" in front of every
 * figure, which read like a receipt from a dot-matrix printer.
 */
async function streamInvoicePdf(invoice, res) {
  const agency = await getAgencySettings();
  const safeNumber = String(invoice.invoiceNumber || "invoice").replace(/[^A-Za-z0-9._-]/g, "-");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${safeNumber}.pdf"`);

  const doc = new PDFDocument({ size: PAGE.size, margin: PAGE.margin, bufferPages: true });
  doc.on("error", () => res.end());
  doc.pipe(res);

  const fonts = applyFonts(doc);
  const money = (value) => currency(value, fonts.rupee);
  const left = PAGE.margin;
  const right = PAGE.width - PAGE.margin;

  const items = lineItemsOf(invoice);
  const subtotal = Number(invoice.amount || 0);
  const gst = Number(invoice.gstAmount || 0);
  const total = Number(invoice.totalAmount || 0);
  const paid = Number(invoice.paidAmount || 0);
  const balance = Math.max(total - paid, 0);

  // ---------- header band ----------
  // The band is sized from the text rather than fixed: a long agency address used to wrap
  // and collide with the GSTIN line underneath it.
  const brandX = left + 52;
  const brandWidth = 268;
  const addressLine = agency.address || "";
  const metaLine = [agency.gstNumber ? `GSTIN ${agency.gstNumber}` : null, agency.website].filter(Boolean).join("   ·   ");

  doc.font(fonts.regular).fontSize(8.5);
  const addressHeight = addressLine ? doc.heightOfString(addressLine, { width: brandWidth }) : 0;
  const bandHeight = Math.max(104, 34 + 20 + addressHeight + (metaLine ? 14 : 0) + 18);

  doc.save().rect(0, 0, PAGE.width, bandHeight).fill(COLORS.black).restore();

  // Brand mark: a ring and the OB monogram, matching the app icon.
  const markY = bandHeight / 2;
  doc.save().lineWidth(1.6).strokeColor(COLORS.orange).circle(left + 21, markY, 19).stroke().restore();
  doc.font(fonts.bold).fontSize(15).fillColor(COLORS.yellow)
    .text("OB", left + 2, markY - 7, { width: 38, align: "center", lineBreak: false });

  let headY = 32;
  doc.font(fonts.bold).fontSize(15).fillColor("#FFFFFF")
    .text(agency.agencyName || "OptiBrandz", brandX, headY, { width: brandWidth, lineBreak: false });
  headY += 20;
  if (addressLine) {
    doc.font(fonts.regular).fontSize(8.5).fillColor("#B8B2A9")
      .text(addressLine, brandX, headY, { width: brandWidth });
    headY = doc.y + 2;
  }
  if (metaLine) {
    doc.font(fonts.semibold).fontSize(8.5).fillColor(COLORS.yellow)
      .text(metaLine, brandX, headY, { width: brandWidth, lineBreak: false });
  }

  const isTaxInvoice = Number(invoice.gstAmount || 0) > 0 || Boolean(agency.gstNumber);
  doc.font(fonts.bold).fontSize(19).fillColor("#FFFFFF")
    .text(isTaxInvoice ? "TAX INVOICE" : "INVOICE", right - 220, 32, { width: 220, align: "right", characterSpacing: 1.2 });
  doc.font(fonts.semibold).fontSize(10).fillColor(COLORS.yellow)
    .text(invoice.invoiceNumber || "", right - 220, 58, { width: 220, align: "right", lineBreak: false });
  doc.font(fonts.regular).fontSize(8.5).fillColor("#B8B2A9")
    .text(`Issued ${longDate(invoice.createdAt)}`, right - 220, 74, { width: 220, align: "right", lineBreak: false });

  // ---------- parties ----------
  let y = bandHeight + 26;
  const colWidth = (PAGE.contentWidth - 24) / 2;

  const partyBlock = (x, heading, lines) => {
    doc.font(fonts.semibold).fontSize(8).fillColor(COLORS.muted)
      .text(heading.toUpperCase(), x, y, { characterSpacing: 0.8 });
    let cursor = y + 14;
    lines.filter(Boolean).forEach((line, index) => {
      doc.font(index === 0 ? fonts.bold : fonts.regular)
        .fontSize(index === 0 ? 11 : 9)
        .fillColor(index === 0 ? COLORS.ink : COLORS.body)
        .text(line, x, cursor, { width: colWidth });
      cursor = doc.y + 1;
    });
    return cursor;
  };

  const fromBottom = partyBlock(left, "From", [
    agency.agencyName,
    agency.address,
    [agency.phone, agency.email].filter(Boolean).join("  ·  ")
  ]);
  const toBottom = partyBlock(left + colWidth + 24, "Bill to", [
    invoice.client?.businessName || "Client",
    invoice.client?.contactPerson,
    [invoice.clientPhone || invoice.client?.phone, invoice.client?.email].filter(Boolean).join("  ·  "),
    invoice.client?.gstNumber ? `GSTIN  ${invoice.client.gstNumber}` : null
  ]);

  // ---------- dates and status ----------
  y = Math.max(fromBottom, toBottom) + 16;
  rule(doc, y);
  y += 14;

  const metaCell = (x, label, value, width) => {
    doc.font(fonts.semibold).fontSize(7.5).fillColor(COLORS.muted)
      .text(label.toUpperCase(), x, y, { width, characterSpacing: 0.6 });
    doc.font(fonts.semibold).fontSize(10).fillColor(COLORS.ink)
      .text(value, x, y + 12, { width });
  };
  const metaWidth = PAGE.contentWidth / 3;
  metaCell(left, "Invoice date", longDate(invoice.createdAt), metaWidth);
  metaCell(left + metaWidth, "Due date", longDate(invoice.dueDate), metaWidth);

  const tone = STATUS_TONES[invoice.status] || STATUS_TONES.PENDING;
  doc.font(fonts.semibold).fontSize(7.5).fillColor(COLORS.muted)
    .text("STATUS", left + metaWidth * 2, y, { width: metaWidth, characterSpacing: 0.6 });
  pill(doc, invoice.status || "PENDING", left + metaWidth * 2, y + 10, {
    fill: tone.fill, textColor: tone.text, fonts
  });

  y += 42;

  // ---------- line items ----------
  // The table is paginated by hand. Left to itself PDFKit starts a new page the moment
  // text crosses the bottom margin, which with a dozen long descriptions turned a single
  // invoice into sixteen pages of fragments.
  const descX = left + 12;
  const amountRight = right - 12;
  const rowHeight = 26;
  const pageBottom = doc.page.height - PAGE.margin;
  const itemsLimit = pageBottom - 40;

  const drawItemsHeader = (atY) => {
    doc.save().rect(left, atY, PAGE.contentWidth, 24).fill(COLORS.panel).restore();
    doc.font(fonts.semibold).fontSize(8).fillColor(COLORS.muted);
    doc.text("DESCRIPTION", descX, atY + 8, { width: PAGE.contentWidth - 160, characterSpacing: 0.7 });
    doc.text("AMOUNT", amountRight - 120, atY + 8, { width: 120, align: "right", characterSpacing: 0.7 });
    return atY + 24;
  };

  y = drawItemsHeader(y);

  items.forEach((item, index) => {
    const description = String(item.description || "Service");
    doc.font(fonts.regular).fontSize(9.5);
    const textHeight = doc.heightOfString(description, { width: PAGE.contentWidth - 170 });
    const height = Math.max(rowHeight, textHeight + 14);

    if (y + height > itemsLimit) {
      doc.addPage();
      y = drawItemsHeader(PAGE.margin);
    }

    if (index % 2 === 1) {
      doc.save().rect(left, y, PAGE.contentWidth, height).fill("#FCFBF7").restore();
    }
    doc.font(fonts.regular).fontSize(9.5).fillColor(COLORS.body)
      .text(description, descX, y + 8, { width: PAGE.contentWidth - 170 });
    doc.font(fonts.semibold).fontSize(9.5).fillColor(COLORS.ink)
      .text(money(item.amount), amountRight - 120, y + 8, { width: 120, align: "right", lineBreak: false });
    y += height;
    rule(doc, y);
  });

  // Totals, words and signature belong together; if they will not fit under the last row,
  // move the whole group to a fresh page rather than splitting it.
  if (y + 210 > itemsLimit) {
    doc.addPage();
    y = PAGE.margin;
  }

  // ---------- totals ----------
  y += 18;
  const boxWidth = 232;
  const boxX = right - boxWidth;

  const totalsRow = (label, value, { strong = false, accent = null } = {}) => {
    doc.font(strong ? fonts.bold : fonts.regular).fontSize(strong ? 11 : 9.5)
      .fillColor(accent || (strong ? COLORS.ink : COLORS.body));
    doc.text(label, boxX + 14, y, { width: boxWidth - 110 });
    doc.text(value, boxX + 14, y, { width: boxWidth - 28, align: "right" });
    y += strong ? 20 : 17;
  };

  totalsRow("Subtotal", money(subtotal));
  if (gst > 0) totalsRow("GST", money(gst));

  rule(doc, y + 2);
  y += 10;
  doc.save().rect(boxX, y - 4, boxWidth, 30).fill(COLORS.panel).restore();
  totalsRow("Total", money(total), { strong: true });
  y += 6;

  if (paid > 0) totalsRow("Paid", `− ${money(paid)}`, { accent: COLORS.green });
  totalsRow("Balance due", money(balance), { strong: true, accent: balance > 0 ? COLORS.red : COLORS.green });

  // ---------- amount in words ----------
  y += 12;
  doc.font(fonts.semibold).fontSize(7.5).fillColor(COLORS.muted)
    .text("AMOUNT IN WORDS", left, y, { characterSpacing: 0.6 });
  // The totals panel sits above this, not beside it, so the words get the full width and
  // no longer wrap mid-phrase.
  doc.font(fonts.semibold).fontSize(9.5).fillColor(COLORS.ink)
    .text(amountInWords(total), left, y + 12, { width: PAGE.contentWidth });
  y = Math.max(doc.y, y + 30) + 14;

  // ---------- payment details and notes ----------
  const bank = agency.bankDetails && typeof agency.bankDetails === "object" ? agency.bankDetails : null;
  if (bank || invoice.notes || agency.invoiceNotes) {
    rule(doc, y);
    y += 14;
    if (bank) {
      doc.font(fonts.semibold).fontSize(7.5).fillColor(COLORS.muted)
        .text("PAYMENT DETAILS", left, y, { characterSpacing: 0.6 });
      let cursor = y + 12;
      Object.entries(bank).forEach(([key, value]) => {
        const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
        doc.font(fonts.regular).fontSize(9).fillColor(COLORS.body)
          .text(`${label}: ${value}`, left, cursor, { width: colWidth });
        cursor = doc.y + 1;
      });
    }
    const note = invoice.notes || agency.invoiceNotes;
    if (note) {
      doc.font(fonts.semibold).fontSize(7.5).fillColor(COLORS.muted)
        .text("NOTES", left + colWidth + 24, y, { characterSpacing: 0.6 });
      doc.font(fonts.regular).fontSize(9).fillColor(COLORS.body)
        .text(note, left + colWidth + 24, y + 12, { width: colWidth });
    }
    y = doc.y + 18;
  }

  // ---------- signature ----------
  // Positioned from the bottom of the page. Writing past the bottom margin makes PDFKit
  // silently start a new page — an earlier version put the footer at y=792 against a
  // 793.89 margin and turned a one-page invoice into three.
  const footerY = pageBottom - 10;
  const signatureY = Math.min(Math.max(y, 600), footerY - 84);

  doc.font(fonts.regular).fontSize(9).fillColor(COLORS.muted)
    .text(`For ${agency.agencyName || "OptiBrandz"}`, right - 200, signatureY, { width: 200, align: "right", lineBreak: false });
  doc.save().lineWidth(0.7).strokeColor(COLORS.hairline)
    .moveTo(right - 200, signatureY + 40).lineTo(right, signatureY + 40).stroke().restore();
  doc.font(fonts.semibold).fontSize(8.5).fillColor(COLORS.body)
    .text("Authorised signatory", right - 200, signatureY + 46, { width: 200, align: "right", lineBreak: false });

  // ---------- footer on every page ----------
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    rule(doc, footerY - 12);
    doc.font(fonts.regular).fontSize(8).fillColor(COLORS.muted)
      .text([agency.agencyName, agency.email, agency.phone || agency.whatsapp].filter(Boolean).join("  ·  "),
        left, footerY, { width: PAGE.contentWidth * 0.6, lineBreak: false });
    doc.font(fonts.regular).fontSize(8).fillColor(COLORS.muted).text(
      range.count > 1
        ? `${invoice.invoiceNumber} · Page ${index + 1} of ${range.count}`
        : "Computer generated invoice",
      left, footerY, { width: PAGE.contentWidth, align: "right", lineBreak: false }
    );
  }

  doc.flushPages();
  doc.end();
}

module.exports = { streamInvoicePdf };
