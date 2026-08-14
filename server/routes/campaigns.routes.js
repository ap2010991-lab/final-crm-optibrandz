const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const asyncRoute = require("../utils/asyncRoute");

const router = express.Router();

const campaignSchema = z.object({
  clientId: z.string(),
  month: z.number(),
  year: z.number(),
  platform: z.string(),
  adSpend: z.number().optional(),
  leadsGenerated: z.number().optional(),
  impressions: z.number().optional(),
  clicks: z.number().optional(),
  ctr: z.number().optional(),
  cpl: z.number().optional(),
  seoKeywords: z.any().optional(),
  followerGrowth: z.number().optional(),
  reach: z.number().optional(),
  engagement: z.number().optional(),
  notes: z.string().optional()
});

const campaignPutSchema = z.object({
  clientId: z.string().optional(),
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().min(2000).max(2100).optional(),
  platform: z.string().optional(),
  adSpend: z.number().min(0).optional(),
  leadsGenerated: z.number().int().min(0).optional(),
  impressions: z.number().int().min(0).optional(),
  clicks: z.number().int().min(0).optional(),
  ctr: z.number().min(0).optional(),
  cpl: z.number().min(0).optional(),
  notes: z.string().max(2000).optional()
});

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
