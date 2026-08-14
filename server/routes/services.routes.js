const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const requireRole = require("../middleware/requireRole");
const asyncRoute = require("../utils/asyncRoute");

const router = express.Router();

const serviceSchema = z.object({
  clientId: z.string(),
  serviceType: z.string(),
  packageName: z.string().optional(),
  monthlyValue: z.number(),
  startDate: z.string().optional(),
  status: z.string().default("ACTIVE"),
  deliverables: z.any().optional()
});

router.get("/", asyncRoute(async (req, res) => {
  const data = await prisma.serviceOrder.findMany({
    where: req.query.clientId ? { clientId: String(req.query.clientId) } : {},
    orderBy: { createdAt: "desc" }
  });
  res.json({ data });
}));

router.post("/", asyncRoute(async (req, res) => {
  const body = serviceSchema.parse(req.body);
  const order = await prisma.serviceOrder.create({
    data: {
      ...body,
      startDate: body.startDate ? new Date(body.startDate) : new Date(),
      deliverables: body.deliverables || {}
    }
  });
  res.status(201).json({ data: order });
}));

router.put("/:id", asyncRoute(async (req, res) => {
  const body = serviceSchema.partial().parse(req.body);
  const current = await prisma.serviceOrder.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Service not found" });
  const order = await prisma.serviceOrder.update({
    where: { id: req.params.id },
    data: { ...body, ...(body.startDate ? { startDate: new Date(body.startDate) } : {}) }
  });
  res.json({ data: order });
}));

// Deleting a service also removes its tasks, so it is limited to the owner.
router.delete("/:id", requireRole(["OWNER"]), asyncRoute(async (req, res) => {
  const current = await prisma.serviceOrder.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Service not found" });
  await prisma.serviceOrder.delete({ where: { id: req.params.id } });
  res.json({ data: current });
}));

module.exports = router;
