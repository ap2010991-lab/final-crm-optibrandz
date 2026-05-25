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
  platform: z.string().optional(),
  adSpend: z.number().optional(),
  leadsGenerated: z.number().optional(),
  impressions: z.number().optional(),
  clicks: z.number().optional(),
  ctr: z.number().optional(),
  cpl: z.number().optional()
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
  const item = await prisma.campaignLog.update({ where: { id: req.params.id }, data: body });
  res.json({ data: item });
}));

module.exports = router;
