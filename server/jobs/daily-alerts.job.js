const cron = require("node-cron");
const prisma = require("../db/prisma");

async function createNotification(userId, type, message, link) {
  if (!userId) return null;
  return prisma.notification.create({ data: { userId, type, message, link, isRead: false } });
}

function registerDailyAlerts() {
  cron.schedule("0 9 * * *", async () => {
    const owner = await prisma.user.findFirst({ where: { role: "OWNER", isActive: true } });
    const [leads, tasks, invoices] = await Promise.all([
      prisma.lead.findMany({ where: { followUpDate: { lte: new Date() }, status: { notIn: ["CONVERTED", "LOST"] } } }),
      prisma.task.findMany({ where: { dueDate: { lte: new Date() }, status: { not: "DONE" } } }),
      prisma.invoice.findMany({ where: { dueDate: { lt: new Date() }, status: "PENDING" } })
    ]);
    await Promise.all([
      ...leads.map((lead) => createNotification(lead.assignedToId || owner?.id, "LEAD", `Follow up ${lead.name}`, `/leads/${lead.id}`)),
      ...tasks.map((task) => createNotification(task.assignedToId, "TASK", `Task due: ${task.title}`, "/tasks")),
      ...invoices.map(async (invoice) => {
        await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "OVERDUE" } });
        return createNotification(owner?.id, "INVOICE", `Invoice ${invoice.invoiceNumber} is overdue`, "/invoices");
      })
    ]);
  });
}

module.exports = { registerDailyAlerts, createNotification };
