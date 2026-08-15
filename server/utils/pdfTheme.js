const path = require("path");
const fs = require("fs");

/**
 * Shared look for every PDF the CRM produces.
 *
 * The documents used to be plain left-aligned Helvetica with "INR" in front of every
 * figure, because the standard PDF fonts have no rupee glyph — the character rendered at
 * zero width. Inter is embedded instead: it carries ₹, it is OFL licensed so it can ship
 * with the app, and it is the same face the CRM interface uses, so an invoice looks like
 * it came from the same product.
 */
const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");

const FONTS = {
  regular: path.join(FONT_DIR, "Inter-Regular.ttf"),
  semibold: path.join(FONT_DIR, "Inter-SemiBold.ttf"),
  bold: path.join(FONT_DIR, "Inter-Bold.ttf")
};

const hasEmbeddedFonts = Object.values(FONTS).every((file) => fs.existsSync(file));

const COLORS = {
  ink: "#12100E",
  body: "#3F3A34",
  muted: "#8A8279",
  hairline: "#E5E0D6",
  panel: "#FBF8F1",
  black: "#090909",
  orange: "#FF7A18",
  yellow: "#FFD84D",
  green: "#17836F",
  red: "#BE123C"
};

const PAGE = { size: "A4", width: 595.28, margin: 48 };
PAGE.contentWidth = PAGE.width - PAGE.margin * 2;

/**
 * Registers the embedded faces and returns the names to use, falling back to the built-in
 * Helvetica (and a plain "Rs." prefix) if the font files are ever missing from a build.
 */
function applyFonts(doc) {
  if (!hasEmbeddedFonts) {
    return { regular: "Helvetica", semibold: "Helvetica-Bold", bold: "Helvetica-Bold", rupee: false };
  }
  doc.registerFont("body", FONTS.regular);
  doc.registerFont("semibold", FONTS.semibold);
  doc.registerFont("bold", FONTS.bold);
  return { regular: "body", semibold: "semibold", bold: "bold", rupee: true };
}

const formatAmount = (value) =>
  Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const currency = (value, withRupee) => (withRupee ? `₹${formatAmount(value)}` : `Rs. ${formatAmount(value)}`);

const longDate = (value) => (value
  ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
  : "—");

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven",
  "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

/**
 * Indian numbering: crore, lakh, thousand, hundred. Printing the amount in words is
 * expected on a GST invoice and is what makes a document read as official rather than
 * as a printout.
 */
function amountInWords(value) {
  const total = Math.round(Number(value || 0) * 100) / 100;
  const rupees = Math.floor(total);
  const paise = Math.round((total - rupees) * 100);
  if (rupees === 0 && paise === 0) return "Zero Rupees Only";

  const parts = [];
  const push = (count, label) => { if (count) parts.push(`${twoDigits(count)} ${label}`); };
  push(Math.floor(rupees / 10000000), "Crore");
  push(Math.floor((rupees % 10000000) / 100000), "Lakh");
  push(Math.floor((rupees % 100000) / 1000), "Thousand");
  push(Math.floor((rupees % 1000) / 100), "Hundred");
  const tail = rupees % 100;
  if (tail) parts.push((parts.length ? "and " : "") + twoDigits(tail));

  const rupeeWords = parts.length ? `${parts.join(" ")} Rupees` : "";
  const paiseWords = paise ? `${rupeeWords ? " and " : ""}${twoDigits(paise)} Paise` : "";
  return `${rupeeWords}${paiseWords} Only`.trim();
}

/** A thin horizontal rule at the current vertical position. */
function rule(doc, y, color = COLORS.hairline, width = 0.7) {
  doc.save().lineWidth(width).strokeColor(color)
    .moveTo(PAGE.margin, y).lineTo(PAGE.width - PAGE.margin, y).stroke().restore();
}

/** A filled, rounded status pill. Returns its width so callers can lay out around it. */
function pill(doc, text, x, y, { fill, textColor, fonts }) {
  doc.font(fonts.semibold).fontSize(8.5);
  const paddingX = 8;
  const width = doc.widthOfString(text.toUpperCase()) + paddingX * 2;
  const height = 17;
  doc.save().roundedRect(x, y, width, height, 8.5).fill(fill).restore();
  doc.fillColor(textColor).text(text.toUpperCase(), x + paddingX, y + 5, { lineBreak: false, characterSpacing: 0.4 });
  return width;
}

const STATUS_TONES = {
  PAID: { fill: "#DCFCE7", text: "#14532D" },
  PARTIAL: { fill: "#DBEAFE", text: "#1E40AF" },
  PENDING: { fill: "#FEF3C7", text: "#854D0E" },
  OVERDUE: { fill: "#FFE4E6", text: COLORS.red },
  CANCELLED: { fill: "#E7E5E4", text: "#57534E" }
};

module.exports = {
  PAGE, COLORS, STATUS_TONES,
  applyFonts, hasEmbeddedFonts,
  currency, formatAmount, longDate, amountInWords,
  rule, pill
};
