const PDFDocument = require("pdfkit");
const { getAgencySettings } = require("./agencySettings");
const { PAGE, COLORS, applyFonts, longDate, rule } = require("./pdfTheme");

const monthName = (month, year) =>
  new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

/**
 * Renders the monthly client report.
 *
 * This goes to the client at the point they are deciding whether to renew, so it is laid
 * out to be read: a branded header, headline figures as stat tiles, then the written
 * summary. Previously it was three lines of unstyled text.
 */
async function streamReportPdf(report, stats, res) {
  const agency = await getAgencySettings();
  const period = monthName(report.month, report.year);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="report-${report.month}-${report.year}.pdf"`);

  const doc = new PDFDocument({ size: PAGE.size, margin: PAGE.margin, bufferPages: true });
  doc.on("error", () => res.end());
  doc.pipe(res);

  const fonts = applyFonts(doc);
  const left = PAGE.margin;
  const right = PAGE.width - PAGE.margin;

  // ---------- header ----------
  const bandHeight = 112;
  doc.save().rect(0, 0, PAGE.width, bandHeight).fill(COLORS.black).restore();
  doc.save().lineWidth(1.6).strokeColor(COLORS.orange).circle(left + 21, 56, 19).stroke().restore();
  doc.font(fonts.bold).fontSize(15).fillColor(COLORS.yellow)
    .text("OB", left + 2, 49, { width: 38, align: "center", lineBreak: false });

  doc.font(fonts.semibold).fontSize(8.5).fillColor(COLORS.yellow)
    .text("PERFORMANCE REPORT", left + 52, 34, { characterSpacing: 1.1, lineBreak: false });
  doc.font(fonts.bold).fontSize(19).fillColor("#FFFFFF")
    .text(report.client?.businessName || "Client", left + 52, 50, { width: 320, lineBreak: false });
  doc.font(fonts.regular).fontSize(9.5).fillColor("#B8B2A9")
    .text(period, left + 52, 76, { width: 320, lineBreak: false });

  doc.font(fonts.regular).fontSize(8.5).fillColor("#B8B2A9")
    .text(agency.agencyName || "OptiBrandz", right - 200, 52, { width: 200, align: "right", lineBreak: false });
  doc.text(`Prepared ${longDate(report.createdAt)}`, right - 200, 68, { width: 200, align: "right", lineBreak: false });

  // ---------- stat tiles ----------
  let y = bandHeight + 28;
  const tiles = (stats?.tiles || []).slice(0, 4);
  if (tiles.length) {
    const gap = 12;
    const tileWidth = (PAGE.contentWidth - gap * (tiles.length - 1)) / tiles.length;
    tiles.forEach((tile, index) => {
      const x = left + index * (tileWidth + gap);
      doc.save().roundedRect(x, y, tileWidth, 62, 10).fill(COLORS.panel).restore();
      doc.font(fonts.bold).fontSize(17).fillColor(COLORS.ink)
        .text(String(tile.value), x + 12, y + 13, { width: tileWidth - 24, lineBreak: false });
      doc.font(fonts.semibold).fontSize(7.5).fillColor(COLORS.muted)
        .text(String(tile.label).toUpperCase(), x + 12, y + 38, { width: tileWidth - 24, characterSpacing: 0.5 });
    });
    y += 62 + 26;
  }

  // ---------- summary ----------
  doc.font(fonts.semibold).fontSize(8).fillColor(COLORS.muted)
    .text("SUMMARY", left, y, { characterSpacing: 0.8 });
  y += 16;
  doc.font(fonts.regular).fontSize(10.5).fillColor(COLORS.body)
    .text(report.summary || "", left, y, { width: PAGE.contentWidth, lineGap: 4, align: "left" });
  y = doc.y + 22;

  // ---------- delivery breakdown ----------
  if (stats?.breakdown?.length) {
    rule(doc, y);
    y += 16;
    doc.font(fonts.semibold).fontSize(8).fillColor(COLORS.muted)
      .text("WHAT WENT OUT", left, y, { characterSpacing: 0.8 });
    y += 16;
    stats.breakdown.forEach((row) => {
      doc.font(fonts.regular).fontSize(9.5).fillColor(COLORS.body)
        .text(row.label, left + 4, y, { width: PAGE.contentWidth - 90 });
      doc.font(fonts.semibold).fontSize(9.5).fillColor(COLORS.ink)
        .text(String(row.value), right - 90, y, { width: 86, align: "right", lineBreak: false });
      y = doc.y + 6;
      rule(doc, y - 2);
      y += 4;
    });
  }

  // ---------- footer ----------
  const footerY = doc.page.height - PAGE.margin - 10;
  rule(doc, footerY - 12);
  doc.font(fonts.regular).fontSize(8).fillColor(COLORS.muted)
    .text([agency.agencyName, agency.email, agency.website].filter(Boolean).join("  ·  "),
      left, footerY, { width: PAGE.contentWidth * 0.7, lineBreak: false });
  doc.font(fonts.regular).fontSize(8).fillColor(COLORS.muted)
    .text(period, left, footerY, { width: PAGE.contentWidth, align: "right", lineBreak: false });

  doc.end();
}

module.exports = { streamReportPdf };
