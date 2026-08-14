const cron = require("node-cron");
const prisma = require("../db/prisma");

async function createNotification(userId, type, message, link) {
  if (!userId) return null;
  return prisma.notification.create({ data: { userId, type, message, link, isRead: false } });
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

// Marks genuinely overdue invoices and files a notification for the work that is due.
// Exported so it can run both from node-cron (long-running host) and from the
// /api/cron/daily HTTP endpoint that Vercel Cron calls.
async function runDailyAlerts() {
  const today = startOfToday();
  const owner = await prisma.user.findFirst({ where: { role: "OWNER", isActive: true } });
  const [leads, tasks, invoices] = await Promise.all([
    prisma.lead.findMany({ where: { followUpDate: { lte: new Date() }, status: { notIn: ["CONVERTED", "LOST"] } } }),
    prisma.task.findMany({ where: { dueDate: { lte: new Date() }, status: { not: "DONE" } } }),
    prisma.invoice.findMany({ where: { dueDate: { lt: today }, status: { in: ["PENDING", "PARTIAL"] } } })
  ]);

  const overdueIds = invoices.map((invoice) => invoice.id);
  if (overdueIds.length) {
    await prisma.invoice.updateMany({ where: { id: { in: overdueIds } }, data: { status: "OVERDUE" } });
  }

  await Promise.all([
    ...leads.map((lead) => createNotification(lead.assignedToId || owner?.id, "LEAD", `Follow up ${lead.name}`, `/leads/${lead.id}`)),
    ...tasks.map((task) => createNotification(task.assignedToId, "TASK", `Task due: ${task.title}`, "/services")),
    ...invoices.map((invoice) => createNotification(owner?.id, "INVOICE", `Invoice ${invoice.invoiceNumber} is overdue`, "/invoices"))
  ]);

  return { leads: leads.length, tasks: tasks.length, invoicesMarkedOverdue: overdueIds.length };
}

function registerDailyAlerts() {
  cron.schedule("0 9 * * *", () => {
    runDailyAlerts().catch((error) => console.error("daily-alerts failed", error));
  });
}

module.exports = { registerDailyAlerts, runDailyAlerts, createNotification };
