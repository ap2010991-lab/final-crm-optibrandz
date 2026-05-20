const bcrypt = require("bcrypt");

const today = new Date();
const addDays = (days) => new Date(today.getTime() + days * 86400000).toISOString();

const users = [
  { id: "u-owner", name: "Alok Pandey", email: "alok@optibrandz.in", password: bcrypt.hashSync("admin123", 12), role: "OWNER", avatar: "AP", phone: "+91 87566 46053", isActive: true },
  { id: "u-am", name: "Nisha Shah", email: "nisha@optibrandz.in", password: bcrypt.hashSync("admin123", 12), role: "ACCOUNT_MANAGER", avatar: "NS", phone: "+91 90000 00001", isActive: true },
  { id: "u-seo", name: "Rohan Mehta", email: "rohan@optibrandz.in", password: bcrypt.hashSync("admin123", 12), role: "SEO_EXEC", avatar: "RM", phone: "+91 90000 00002", isActive: true },
  { id: "u-design", name: "Kinjal Patel", email: "kinjal@optibrandz.in", password: bcrypt.hashSync("admin123", 12), role: "DESIGNER", avatar: "KP", phone: "+91 90000 00003", isActive: true },
  { id: "u-client", name: "Amit Client", email: "client@demo.in", password: bcrypt.hashSync("admin123", 12), role: "CLIENT", avatar: "AC", clientId: "c-1", isActive: true }
];

const clients = [
  { id: "c-1", businessName: "Aarav Dental Studio", contactPerson: "Dr. Amit Patel", phone: "+91 98765 43210", email: "amit@aaravdental.in", city: "Vapi", industry: "Healthcare", websiteUrl: "https://aaravdental.in", healthScore: 86, status: "ACTIVE", renewalDate: addDays(24), totalValue: 78000, services: ["SEO", "SMO", "GOOGLE_ADS"] },
  { id: "c-2", businessName: "Silvassa Furnishings", contactPerson: "Mehul Jain", phone: "+91 98765 43211", email: "mehul@silvassafurnishings.in", city: "Silvassa", industry: "Retail", healthScore: 64, status: "ACTIVE", renewalDate: addDays(42), totalValue: 54000, services: ["META_ADS", "SMO"] },
  { id: "c-3", businessName: "Daman Food Co.", contactPerson: "Pooja Rao", phone: "+91 98765 43212", email: "pooja@damanfood.in", city: "Daman", industry: "F&B", healthScore: 38, status: "ONBOARDING", renewalDate: addDays(16), totalValue: 92000, services: ["WEBSITE", "CONTENT", "GMB"] }
];

const leads = [
  { id: "l-1", name: "Rakesh Shah", phone: "+91 99887 00123", email: "rakesh@textiles.in", businessName: "Vapi Textiles", city: "Vapi", source: "WHATSAPP", status: "NEW", serviceInterest: ["SEO", "GMB"], budget: "35000", score: 60, assignedToId: "u-am", followUpDate: addDays(1), notes: "Wants local SEO and GMB enquiries." },
  { id: "l-2", name: "Anjali Desai", phone: "+91 99887 00124", email: "anjali@salon.in", businessName: "Glow Salon", city: "Valsad", source: "INSTAGRAM", status: "CONTACTED", serviceInterest: ["SMO", "META_ADS"], budget: "25000", score: 60, assignedToId: "u-am", followUpDate: addDays(0), notes: "Asked for content calendar sample." },
  { id: "l-3", name: "Milan Parmar", phone: "+91 99887 00125", businessName: "Parmar Builders", city: "Daman", source: "GOOGLE_ADS", status: "DEMO_SCHEDULED", serviceInterest: ["WEBSITE", "GOOGLE_ADS"], score: 30, assignedToId: "u-owner", followUpDate: addDays(2), notes: "Website redesign demo scheduled." },
  { id: "l-4", name: "Sneha Iyer", phone: "+91 99887 00126", email: "sneha@academy.in", businessName: "SkillNest Academy", city: "Silvassa", source: "REFERRAL", status: "PROPOSAL_SENT", serviceInterest: ["SMM", "CONTENT"], budget: "45000", score: 60, assignedToId: "u-am", followUpDate: addDays(3), notes: "Proposal sent with 3-month package." },
  { id: "l-5", name: "Kunal Mistry", phone: "+91 99887 00127", businessName: "Kunal Interiors", city: "Vapi", source: "WALK_IN", status: "NEGOTIATION", serviceInterest: ["GRAPHIC_DESIGN", "SMO"], budget: "18000", score: 50, assignedToId: "u-owner", followUpDate: addDays(-1), notes: "Negotiating monthly design retainer." }
];

const serviceOrders = [
  { id: "s-1", clientId: "c-1", serviceType: "SEO", packageName: "Growth SEO", monthlyValue: 28000, startDate: addDays(-90), status: "ACTIVE", deliverables: { keywords: 10, reports: 1 } },
  { id: "s-2", clientId: "c-1", serviceType: "SMO", packageName: "Social Pro", monthlyValue: 26000, startDate: addDays(-80), status: "ACTIVE", deliverables: { posts: 26, reels: 8 } },
  { id: "s-3", clientId: "c-2", serviceType: "META_ADS", packageName: "Lead Engine", monthlyValue: 30000, startDate: addDays(-60), status: "ACTIVE", deliverables: { campaigns: 3, reports: 1 } },
  { id: "s-4", clientId: "c-3", serviceType: "WEBSITE", packageName: "20 Page Website", monthlyValue: 60000, startDate: addDays(-15), status: "ACTIVE", deliverables: { pages: 20, milestones: 4 } }
];

const tasks = [
  { id: "t-1", title: "Track 10 keywords", serviceOrderId: "s-1", assignedToId: "u-seo", status: "IN_PROGRESS", priority: "HIGH", dueDate: addDays(1) },
  { id: "t-2", title: "Create 26 posts/reels", serviceOrderId: "s-2", assignedToId: "u-design", status: "PENDING", priority: "URGENT", dueDate: addDays(0) },
  { id: "t-3", title: "Optimize ad campaigns", serviceOrderId: "s-3", assignedToId: "u-seo", status: "REVIEW", priority: "MEDIUM", dueDate: addDays(-1) },
  { id: "t-4", title: "Website QA testing", serviceOrderId: "s-4", assignedToId: "u-design", status: "PENDING", priority: "HIGH", dueDate: addDays(3) }
];

const invoices = [
  { id: "i-1", clientId: "c-1", invoiceNumber: "OB-2026-001", amount: 54000, gstAmount: 9720, totalAmount: 63720, paidAmount: 63720, status: "PAID", dueDate: addDays(-12), lineItems: [{ description: "SEO + SMO retainer", amount: 54000 }] },
  { id: "i-2", clientId: "c-2", invoiceNumber: "OB-2026-002", amount: 30000, gstAmount: 5400, totalAmount: 35400, paidAmount: 10000, status: "PARTIAL", dueDate: addDays(5), lineItems: [{ description: "Meta Ads management", amount: 30000 }] },
  { id: "i-3", clientId: "c-3", invoiceNumber: "OB-2026-003", amount: 60000, gstAmount: 10800, totalAmount: 70800, paidAmount: 0, status: "OVERDUE", dueDate: addDays(-3), lineItems: [{ description: "Website milestone", amount: 60000 }] }
];

const campaigns = [
  { id: "g-1", clientId: "c-1", month: 5, year: 2026, platform: "GOOGLE_ADS", adSpend: 42000, leadsGenerated: 96, impressions: 124000, clicks: 4400, ctr: 3.55, cpl: 437, followerGrowth: 420, reach: 64000, engagement: 5.8, seoKeywords: [{ keyword: "dentist in vapi", prev: 8, current: 4 }] },
  { id: "g-2", clientId: "c-2", month: 5, year: 2026, platform: "INSTAGRAM", adSpend: 28000, leadsGenerated: 61, impressions: 89000, clicks: 2900, ctr: 3.26, cpl: 459, followerGrowth: 790, reach: 71000, engagement: 6.4 }
];

const calendarItems = Array.from({ length: 26 }, (_, index) => ({
  id: `cc-${index + 1}`,
  clientId: index % 2 ? "c-1" : "c-2",
  month: 5,
  year: 2026,
  platform: index % 3 === 0 ? "INSTAGRAM" : index % 3 === 1 ? "FACEBOOK" : "LINKEDIN",
  postType: index % 4 === 0 ? "REEL" : "STATIC",
  caption: `Campaign post ${index + 1}`,
  designBrief: "Use brand colors, product-led visual, clear CTA.",
  scheduledDate: addDays(index - 9),
  status: index % 5 === 0 ? "REVIEW" : index % 4 === 0 ? "APPROVED" : "DRAFT"
}));

const activities = [
  { id: "a-1", type: "CALL", note: "Discovery call completed, budget confirmed.", leadId: "l-2", userId: "u-am", createdAt: addDays(-2) },
  { id: "a-2", type: "INVOICE_SENT", note: "May invoice sent over email and WhatsApp.", clientId: "c-2", userId: "u-owner", createdAt: addDays(-1) },
  { id: "a-3", type: "TASK_DONE", note: "Keyword research batch reviewed.", clientId: "c-1", userId: "u-seo", createdAt: addDays(-1) }
];

const notifications = [
  { id: "n-1", userId: "u-owner", type: "INVOICE", message: "Daman Food Co. invoice is overdue", link: "/invoices", isRead: false, createdAt: addDays(-1) },
  { id: "n-2", userId: "u-am", type: "LEAD", message: "Glow Salon follow-up is due today", link: "/leads/l-2", isRead: false, createdAt: addDays(0) }
];

module.exports = { users, clients, leads, serviceOrders, tasks, invoices, campaigns, calendarItems, activities, notifications };
