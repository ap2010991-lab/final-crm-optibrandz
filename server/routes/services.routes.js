const express = require("express");
const { z } = require("zod");
const { serviceOrders, tasks, users } = require("../data");
const verifyToken = require("../middleware/verifyToken");
const requireRole = require("../middleware/requireRole");

const router = express.Router();
router.use(verifyToken);

const defaults = {
  SEO: ["Track 10 keywords", "Submit monthly SEO report"],
  SMO: ["Create 26 posts/reels", "Schedule all content", "Engagement monitoring"],
  SMM: ["Campaign planning", "Creative review", "Lead response audit"],
  GOOGLE_ADS: ["Optimize ad campaigns", "Generate leads report", "A/B test creatives"],
  META_ADS: ["Refresh audiences", "A/B test creatives", "Generate leads report"],
  YOUTUBE: ["Optimize 30 videos", "Thumbnail review", "Monthly analytics report"],
  GMB: ["Optimize 10 keywords", "Post weekly updates", "Review management"],
  WEBSITE: ["Development milestone check", "Content upload", "QA testing"],
  GRAPHIC_DESIGN: ["Create design batch", "Internal review", "Client revisions"],
  INFLUENCER: ["Shortlist creators", "Approve reel scripts", "Campaign report"],
  CONTENT: ["Write captions", "Prepare blogs", "Campaign copy review"]
};

router.get("/", (req, res) => {
  const data = serviceOrders.filter((item) => !req.query.clientId || item.clientId === req.query.clientId);
  res.json({ data });
});

router.post("/", (req, res) => {
  const body = z.object({ clientId: z.string(), serviceType: z.string(), packageName: z.string().optional(), monthlyValue: z.number(), startDate: z.string().optional(), deliverables: z.any().optional() }).parse(req.body);
  const order = { id: `s-${Date.now()}`, ...body, startDate: body.startDate || new Date().toISOString(), status: "ACTIVE", deliverables: body.deliverables || {} };
  serviceOrders.unshift(order);
  const assignee = users.find((user) => user.role === "SEO_EXEC") || users[0];
  (defaults[body.serviceType] || ["Monthly checklist"]).forEach((title, index) => {
    tasks.push({ id: `t-${Date.now()}-${index}`, title, serviceOrderId: order.id, assignedToId: assignee.id, status: "PENDING", priority: "MEDIUM", dueDate: new Date(Date.now() + (index + 2) * 86400000).toISOString() });
  });
  res.status(201).json({ data: order });
});

router.put("/:id", (req, res) => {
  const order = serviceOrders.find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ message: "Service order not found" });
  Object.assign(order, req.body);
  res.json({ data: order });
});

module.exports = router;
