export const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const shortDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

export const longDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export const pretty = (value) => String(value ?? "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());

// Enum-ish codes such as IN_PROGRESS or META_ADS read better title-cased, but running the
// same transform over free text mangles it — invoice number OB-2026-014 became
// "Ob-2026-014" and a business name "E2E Test Traders" became "E2e Test Traders".
const ENUM_CODE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;
export const prettyEnum = (value) => {
  const text = String(value ?? "");
  return ENUM_CODE.test(text) ? pretty(text) : text;
};

// `<input type="date">` needs yyyy-mm-dd, and slicing an ISO string shifts the day for
// anyone east of UTC — India is +5:30, so 1 Sep 00:00 IST used to display as 31 Aug.
export const toDateInput = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

// A date-only input is midday local time so a timezone shift can never move the day.
export const fromDateInput = (value) => {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

export const splitList = (value) =>
  String(value || "").split(",").map((item) => item.trim()).filter(Boolean);

export const balanceDue = (client) =>
  Math.max(Number(client?.totalValue || 0) - Number(client?.advancePaid || 0), 0);

// wa.me needs a bare country-code number. Handles "+91 98765 43210", "098765 43210"
// and a plain 10-digit Indian mobile.
export const normalizePhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

export const initials = (value, fallback = "OB") => {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  return parts.map((part) => part[0]).join("").slice(0, 2).toUpperCase();
};

export const monthLabel = (month, year) =>
  new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
