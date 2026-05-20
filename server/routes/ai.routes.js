const express = require("express");
const multer = require("multer");
const verifyToken = require("../middleware/verifyToken");
const { clients, leads } = require("../data");
const { callGemini, fallbackResponse, hasGeminiKey, systemPrompt } = require("../services/gemini.service");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

router.use(verifyToken);

router.get("/status", (req, res) => {
  res.json({ data: { provider: "Gemini", model: process.env.GEMINI_MODEL || "gemini-2.5-flash", configured: hasGeminiKey(), user: req.user.name } });
});

router.post("/chat", async (req, res, next) => {
  try {
    const prompt = String(req.body.prompt || "").trim();
    if (!prompt) return res.status(422).json({ message: "Prompt is required" });
    const text = await callGemini([{ text: prompt }], systemPrompt(req.user)) || fallbackResponse("chat");
    res.json({ data: { text, live: hasGeminiKey() } });
  } catch (err) {
    next(err);
  }
});

router.post("/image-agent", upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(422).json({ message: "Image is required" });
    const prompt = req.body.prompt || "Analyze this image for Optibrandz CRM. Give brand-fit feedback, campaign use cases, copy ideas, and action items.";
    const parts = [
      { text: prompt },
      { inlineData: { mimeType: req.file.mimetype, data: req.file.buffer.toString("base64") } }
    ];
    const text = await callGemini(parts, systemPrompt(req.user)) || fallbackResponse("image");
    res.json({ data: { text, fileName: req.file.originalname, live: hasGeminiKey() } });
  } catch (err) {
    next(err);
  }
});

router.post("/leads/:id/followup", async (req, res, next) => {
  try {
    const lead = leads.find((item) => item.id === req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found" });
    const prompt = `Draft a persuasive WhatsApp follow-up for this lead. Include one short message, one stronger second follow-up, and a call objective. Lead JSON: ${JSON.stringify(lead)}`;
    const text = await callGemini([{ text: prompt }], systemPrompt(req.user)) || fallbackResponse("lead", { lead });
    res.json({ data: { text, lead, live: hasGeminiKey() } });
  } catch (err) {
    next(err);
  }
});

router.post("/clients/:id/brief", async (req, res, next) => {
  try {
    const client = clients.find((item) => item.id === req.params.id);
    if (!client) return res.status(404).json({ message: "Client not found" });
    const prompt = `Create a client success brief with risks, next best actions, renewal angle, and talking points. Client JSON: ${JSON.stringify(client)}`;
    const text = await callGemini([{ text: prompt }], systemPrompt(req.user)) || fallbackResponse("client", { client });
    res.json({ data: { text, client, live: hasGeminiKey() } });
  } catch (err) {
    next(err);
  }
});

router.post("/content-ideas", async (req, res, next) => {
  try {
    const { businessType = "local business", platform = "Instagram", goal = "generate enquiries" } = req.body;
    const prompt = `Generate 10 content ideas for a ${businessType}. Platform: ${platform}. Goal: ${goal}. Include hooks, post type, caption direction, CTA, and design brief.`;
    const text = await callGemini([{ text: prompt }], systemPrompt(req.user)) || fallbackResponse("content");
    res.json({ data: { text, live: hasGeminiKey() } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
