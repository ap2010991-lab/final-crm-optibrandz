const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const asyncRoute = require("../utils/asyncRoute");
const { serviceTaskDefaults } = require("../utils/serviceDefaults");
const { defaultAssigneeId } = require("../utils/syncClientServices");

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
  const assigneeId = await defaultAssigneeId();
  if (assigneeId) {
    await prisma.task.createMany({
      data: (serviceTaskDefaults[body.serviceType] || ["Monthly checklist"]).map((title, index) => ({
        title,
        serviceOrderId: order.id,
        assignedToId: assigneeId,
        status: "PENDING",
        priority: "MEDIUM",
        dueDate: new Date(Date.now() + (index + 2) * 86400000)
      }))
    });
  }
  res.status(201).json({ data: order });
}));

router.put("/:id", asyncRoute(async (req, res) => {
  const body = serviceSchema.partial().parse(req.body);
  const order = await prisma.serviceOrder.update({
    where: { id: req.params.id },
    data: { ...body, ...(body.startDate ? { startDate: new Date(body.startDate) } : {}) }
  });
  res.json({ data: order });
}));

module.exports = router;
