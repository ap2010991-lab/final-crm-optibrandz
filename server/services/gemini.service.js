const { clients, leads, invoices, tasks, campaigns, calendarItems } = require("../data");

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function crmSnapshot() {
  return {
    clients: clients.map(({ id, businessName, city, industry, healthScore, status, services, renewalDate }) => ({ id, businessName, city, industry, healthScore, status, services, renewalDate })),
    leads: leads.map(({ id, name, businessName, city, source, status, serviceInterest, score, followUpDate, notes }) => ({ id, name, businessName, city, source, status, serviceInterest, score, followUpDate, notes })),
    invoices: invoices.map(({ invoiceNumber, clientId, totalAmount, paidAmount, status, dueDate }) => ({ invoiceNumber, clientId, totalAmount, paidAmount, status, dueDate })),
    openTasks: tasks.filter((task) => task.status !== "DONE").map(({ title, status, priority, dueDate }) => ({ title, status, priority, dueDate })),
    campaigns: campaigns.map(({ clientId, platform, adSpend, leadsGenerated, ctr, cpl, engagement }) => ({ clientId, platform, adSpend, leadsGenerated, ctr, cpl, engagement })),
    calendarLoad: calendarItems.length
  };
}

function hasGeminiKey() {
  return Boolean(process.env.GEMINI_API_KEY);
}

async function callGemini(parts, systemInstruction) {
  if (!hasGeminiKey()) return null;
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction,
      temperature: 0.45
    }
  });
  return response.text || "No response generated.";
}

function fallbackResponse(type, input = {}) {
  const lead = input.lead;
  const client = input.client;
  const options = {
    chat: "AI demo mode: Add GEMINI_API_KEY in server/.env to activate live Gemini replies. Based on the current CRM, prioritize overdue invoices, follow up hot leads today, and push content approvals before renewals.",
    image: "AI demo mode: Gemini image analysis will inspect uploaded creatives, screenshots, or ad mockups and return brand-fit feedback, caption ideas, CTA improvements, and campaign next steps.",
    lead: `AI demo mode follow-up for ${lead?.businessName || "this lead"}: Hi ${lead?.name || "there"}, thanks for connecting with Optibrandz. Based on your interest in ${(lead?.serviceInterest || []).join(", ") || "digital growth"}, we can share a simple growth plan for your business. Are you available today for a 10-minute WhatsApp call?`,
    client: `AI demo mode summary for ${client?.businessName || "this client"}: health looks ${client?.healthScore > 70 ? "strong" : "attention-worthy"}. Review active services, upcoming renewal, unpaid invoices, and next campaign report before the next client check-in.`,
    content: "AI demo mode content ideas: 1. Before/after brand transformation reel. 2. Local SEO proof post. 3. Client testimonial carousel. 4. Founder talking-head reel. 5. Offer post with WhatsApp CTA."
  };
  return options[type];
}

function systemPrompt(user) {
  return `You are Optibrandz AI Growth Agent inside a CRM for Optibrandz Marketing Agency in Vapi, Gujarat.
Be practical, concise, sales-aware, and agency-operations focused.
Use Indian business context, WhatsApp-friendly wording, and INR where needed.
Current signed-in user: ${user?.name || "CRM user"} (${user?.role || "TEAM"}).
CRM snapshot JSON: ${JSON.stringify(crmSnapshot())}`;
}

module.exports = { callGemini, fallbackResponse, hasGeminiKey, systemPrompt };
