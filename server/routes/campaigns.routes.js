const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const asyncRoute = require("../utils/asyncRoute");
const { Platform } = require("../utils/enums");

const router = express.Router();

// One shape for both POST and PUT. They used to differ, so POST happily accepted
// month=99 while PUT rejected it, and the report for that month then found nothing.
const campaignFields = {
  clientId: z.string().min(1),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  platform: Platform,
  adSpend: z.number().min(0).optional(),
  leadsGenerated: z.number().int().min(0).optional(),
  impressions: z.number().int().min(0).optional(),
  clicks: z.number().int().min(0).optional(),
  ctr: z.number().min(0).optional(),
  cpl: z.number().min(0).optional(),
  seoKeywords: z.any().optional(),
  followerGrowth: z.number().int().optional(),
  reach: z.number().int().min(0).optional(),
  engagement: z.number().min(0).optional(),
  notes: z.string().max(2000).optional()
};

const campaignSchema = z.object(campaignFields);
const campaignPutSchema = z.object(campaignFields).partial();

router.get("/", asyncRoute(async (req, res) => {
  const data = await prisma.campaignLog.findMany({
    where: {
      ...(req.query.clientId ? { clientId: String(req.query.clientId) } : {}),
      ...(req.query.month ? { month: Number(req.query.month) } : {}),
      ...(req.query.year ? { year: Number(req.query.year) } : {})
    },
    orderBy: { createdAt: "desc" }
  });
  res.json({ data });
}));

router.post("/", asyncRoute(async (req, res) => {
  const body = campaignSchema.parse(req.body);
  const client = await prisma.client.findUnique({ where: { id: body.clientId } });
  if (!client) return res.status(422).json({ message: "Choose a client for this campaign." });
  const item = await prisma.campaignLog.create({ data: body });
  res.status(201).json({ data: item });
}));

router.put("/:id", asyncRoute(async (req, res) => {
  const body = campaignPutSchema.parse(req.body);
  const current = await prisma.campaignLog.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Campaign not found" });
  const item = await prisma.campaignLog.update({ where: { id: req.params.id }, data: body });
  res.json({ data: item });
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  const current = await prisma.campaignLog.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Campaign not found" });
  await prisma.campaignLog.delete({ where: { id: req.params.id } });
  res.json({ data: current });
}));

module.exports = router;
