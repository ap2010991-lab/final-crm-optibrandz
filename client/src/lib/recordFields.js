// Field definitions shared between a list page and its detail page. They live outside
// the component modules so each page file exports components only.

export const LEAD_STAGES = ["NEW", "CONTACTED", "DEMO_SCHEDULED", "PROPOSAL_SENT", "NEGOTIATION", "CONVERTED", "LOST"];
export const LEAD_SOURCES = ["WHATSAPP", "INSTAGRAM", "GOOGLE_ADS", "META_ADS", "WEBSITE", "REFERRAL", "WALK_IN", "COLD_CALL"];
export const SERVICE_OPTIONS = ["SEO", "SMO", "SMM", "GOOGLE_ADS", "META_ADS", "WEBSITE", "GMB", "CONTENT", "GRAPHIC_DESIGN", "YOUTUBE"];

export const leadFields = [
  { name: "name", label: "Contact name", required: true },
  { name: "phone", label: "Phone", kind: "phone", required: true, placeholder: "+91 98765 43210" },
  { name: "email", label: "Email", kind: "email" },
  { name: "businessName", label: "Business name" },
  { name: "city", label: "City" },
  { name: "source", label: "Source", options: LEAD_SOURCES, required: true },
  { name: "status", label: "Stage", options: LEAD_STAGES, required: true },
  { name: "serviceInterest", label: "Services they want", kind: "multi", options: SERVICE_OPTIONS },
  { name: "budget", label: "Budget", placeholder: "e.g. 25000" },
  { name: "followUpDate", label: "Follow up on", kind: "date", type: "date" },
  { name: "notes", label: "Notes", rows: 3 }
];

export const clientFields = [
  { name: "businessName", label: "Business name", required: true },
  { name: "contactPerson", label: "Contact person", required: true },
  { name: "phone", label: "Phone / WhatsApp", kind: "phone", required: true, placeholder: "+91 98765 43210" },
  { name: "email", label: "Email", kind: "email" },
  { name: "services", label: "Services they bought", kind: "multi", options: SERVICE_OPTIONS },
  { name: "city", label: "City" },
  { name: "industry", label: "Industry" },
  { name: "websiteUrl", label: "Website" },
  { name: "status", label: "Status", options: ["ACTIVE", "ONBOARDING", "PAUSED", "CHURNED"], required: true },
  { name: "mrr", label: "Monthly retainer", kind: "money", help: "Split across their active services." },
  { name: "totalValue", label: "Total deal value", kind: "money" },
  { name: "advancePaid", label: "Advance received", kind: "money" },
  { name: "healthScore", label: "Health score (0-100)", kind: "int" },
  { name: "renewalDate", label: "Renewal date", kind: "date", type: "date" }
];
