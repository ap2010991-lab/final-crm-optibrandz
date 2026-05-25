const prisma = require("../db/prisma");
const { serviceTaskDefaults } = require("./serviceDefaults");

function normalizeServices(services = []) {
  return [...new Set(services.map((item) => String(item).trim().toUpperCase().replace(/[\s-]+/g, "_")).filter(Boolean))];
}

async function defaultAssigneeId() {
  const user = await prisma.user.findFirst({
    where: { isActive: true, role: { in: ["SEO_EXEC", "ACCOUNT_MANAGER", "OWNER", "DESIGNER"] } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }]
  });
  return user?.id;
}

function amount(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

async function setClientMrr(clientId, monthlyRetainer) {
  const target = amount(monthlyRetainer);
  const activeOrders = await prisma.serviceOrder.findMany({
    where: { clientId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" }
  });
  if (!activeOrders.length) {
    if (target > 0) {
      const error = new Error("Choose at least one active service before entering a monthly retainer.");
      error.status = 422;
      throw error;
    }
    return [];
  }

  const existingTotal = activeOrders.reduce((sum, order) => sum + amount(order.monthlyValue), 0);
  let remaining = target;
  return Promise.all(activeOrders.map((order, index) => {
    const monthlyValue = index === activeOrders.length - 1
      ? amount(remaining)
      : amount(existingTotal > 0 ? target * amount(order.monthlyValue) / existingTotal : index === 0 ? target : 0);
    remaining = amount(remaining - monthlyValue);
    return prisma.serviceOrder.update({ where: { id: order.id }, data: { monthlyValue } });
  }));
}

async function syncClientServices(clientId, services = [], monthlyRetainer) {
  const selected = normalizeServices(services);
  const currentOrders = await prisma.serviceOrder.findMany({ where: { clientId } });
  const assigneeId = await defaultAssigneeId();
  const output = [];

  for (const serviceType of selected) {
    const existing = currentOrders.find((order) => order.serviceType === serviceType);
    if (existing) {
      output.push(await prisma.serviceOrder.update({ where: { id: existing.id }, data: { status: "ACTIVE" } }));
    } else {
      const order = await prisma.serviceOrder.create({
        data: {
          clientId,
          serviceType,
          packageName: "Custom",
          monthlyValue: 0,
          startDate: new Date(),
          status: "ACTIVE",
          deliverables: {}
        }
      });
      output.push(order);
      if (assigneeId) {
        await prisma.task.createMany({
          data: (serviceTaskDefaults[serviceType] || ["Monthly checklist"]).map((title, index) => ({
            title,
            serviceOrderId: order.id,
            assignedToId: assigneeId,
            status: "PENDING",
            priority: "MEDIUM",
            dueDate: new Date(Date.now() + (index + 2) * 86400000)
          }))
        });
      }
    }
  }

  const selectedSet = new Set(selected);
  await prisma.serviceOrder.updateMany({
    where: { clientId, serviceType: { notIn: selected }, status: "ACTIVE" },
    data: { status: "PAUSED" }
  });

  if (monthlyRetainer !== undefined) await setClientMrr(clientId, monthlyRetainer);

  return output.concat(currentOrders.filter((order) => !selectedSet.has(order.serviceType)));
}

module.exports = { syncClientServices, setClientMrr, normalizeServices, defaultAssigneeId };
