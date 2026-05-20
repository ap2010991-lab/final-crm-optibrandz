const express = require("express");
const { z } = require("zod");
const { calendarItems } = require("../data");
const verifyToken = require("../middleware/verifyToken");
const requireRole = require("../middleware/requireRole");

const router = express.Router();
router.use(verifyToken);

router.get("/", (req, res) => {
  const data = calendarItems.filter((item) =>
    (!req.query.clientId || item.clientId === req.query.clientId) &&
    (!req.query.month || item.month === Number(req.query.month)) &&
    (!req.query.year || item.year === Number(req.query.year))
  );
  res.json({ data });
});

router.post("/", (req, res) => {
  const item = { id: `cc-${Date.now()}`, status: "DRAFT", ...req.body };
  calendarItems.unshift(item);
  res.status(201).json({ data: item });
});

router.post("/bulk", (req, res) => {
  const body = z.object({ clientId: z.string(), month: z.number(), year: z.number(), count: z.number().default(26), platform: z.string().default("INSTAGRAM") }).parse(req.body);
  const created = Array.from({ length: body.count }, (_, index) => ({
    id: `cc-${Date.now()}-${index}`,
    clientId: body.clientId,
    month: body.month,
    year: body.year,
    platform: body.platform,
    postType: index % 4 === 0 ? "REEL" : "STATIC",
    caption: "",
    designBrief: "",
    scheduledDate: new Date(body.year, body.month - 1, 1 + Math.floor(index * 30 / body.count)).toISOString(),
    status: "DRAFT"
  }));
  calendarItems.push(...created);
  res.status(201).json({ data: created });
});

router.put("/:id", (req, res) => {
  const item = calendarItems.find((entry) => entry.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Content item not found" });
  Object.assign(item, req.body);
  res.json({ data: item });
});

router.put("/:id/approve", requireRole(["CLIENT"]), (req, res) => {
  const item = calendarItems.find((entry) => entry.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Content item not found" });
  Object.assign(item, { status: "APPROVED", approvedAt: new Date().toISOString() });
  res.json({ data: item });
});

module.exports = router;
