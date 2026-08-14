const express = require("express");
const multer = require("multer");
const prisma = require("../db/prisma");
const asyncRoute = require("../utils/asyncRoute");
const { callGemini, fallbackResponse, hasGeminiKey, systemPrompt } = require("../services/gemini.service");

const router = express.Router();
// Vercel rejects request bodies over 4.5 MB before they reach this function, so an
// 8 MB limit here just turned large iPhone photos into an opaque failure.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith("image/"))
});

function requirePermissionFor(permission) {
  return (req, res, next) => {
    if (req.user.role === "OWNER" || (req.user.permissions || []).includes(permission)) return next();
    return res.status(403).json({ message: "This login does not have access to this CRM section" });
  };
}

router.get("/status", (req, res) => {
  res.json({ data: { provider: "Gemini", model: process.env.GEMINI_MODEL || "gemini-2.5-flash", configured: hasGeminiKey(), user: req.user.name } });
});

router.post("/chat", asyncRoute(async (req, res) => {
  const prompt = String(req.body.prompt || "").trim().slice(0, 4000);
  if (!prompt) return res.status(422).json({ message: "Prompt is required" });
  const text = await callGemini([{ text: prompt }], await systemPrompt(req.user)) || fallbackResponse("chat");
  res.json({ data: { text, live: hasGeminiKey() } });
}));

router.post("/image-agent", upload.single("image"), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(422).json({ message: "Choose an image under 4 MB." });
  const prompt = req.body.prompt || "Analyze this image for Optibrandz CRM. Give brand-fit feedback, campaign use cases, copy ideas, and action items.";
  const parts = [
    { text: prompt },
    { inlineData: { mimeType: req.file.mimetype, data: req.file.buffer.toString("base64") } }
  ];
  const text = await callGemini(parts, await systemPrompt(req.user)) || fallbackResponse("image");
  res.json({ data: { text, fileName: req.file.originalname, live: hasGeminiKey() } });
}));

router.post("/leads/:id/followup", requirePermissionFor("leads"), asyncRoute(async (req, res) => {
  const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
  if (!lead) return res.status(404).json({ message: "Lead not found" });
  const prompt = `Draft a persuasive WhatsApp follow-up for this lead. Include one short message, one stronger second follow-up, and a call objective. Lead JSON: ${JSON.stringify(lead)}`;
  const text = await callGemini([{ text: prompt }], await systemPrompt(req.user)) || fallbackResponse("lead", { lead });
  res.json({ data: { text, lead, live: hasGeminiKey() } });
}));

router.post("/clients/:id/brief", requirePermissionFor("clients"), asyncRoute(async (req, res) => {
  const client = await prisma.client.findUnique({ where: { id: req.params.id }, include: { services: true, invoices: true, campaigns: true } });
  if (!client) return res.status(404).json({ message: "Client not found" });
  const prompt = `Create a client success brief with risks, next best actions, renewal angle, and talking points. Client JSON: ${JSON.stringify(client)}`;
  const text = await callGemini([{ text: prompt }], await systemPrompt(req.user)) || fallbackResponse("client", { client });
  res.json({ data: { text, client, live: hasGeminiKey() } });
}));

router.post("/content-ideas", asyncRoute(async (req, res) => {
  const { businessType = "local business", platform = "Instagram", goal = "generate enquiries" } = req.body;
  const prompt = `Generate 10 content ideas for a ${businessType}. Platform: ${platform}. Goal: ${goal}. Include hooks, post type, caption direction, CTA, and design brief.`;
  const text = await callGemini([{ text: prompt }], await systemPrompt(req.user)) || fallbackResponse("content");
  res.json({ data: { text, live: hasGeminiKey() } });
}));

// Turn multer size/type rejections into a message the CRM can actually show.
router.use((err, _req, res, next) => {
  if (err && err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ message: "That image is larger than 4 MB. Please pick a smaller one." });
  return next(err);
});

module.exports = router;
