const cron = require("node-cron");
const prisma = require("../db/prisma");

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Marks genuinely overdue invoices and files a notification for work that is due.
 *
 * Exported so it runs both from node-cron on a long-lived host and from the
 * /api/cron/daily endpoint that Vercel Cron calls.
 *
 * Every notification used to be its own `prisma.notification.create()` inside a
 * Promise.all, so an agency with a few dozen open items opened a few dozen concurrent
 * connections and the job died with "Timed out fetching a new connection from the
 * connection pool" against Supabase's pooler. It is now one read plus one bulk insert.
 */
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

  const candidates = [
    ...leads.map((lead) => ({
      userId: lead.assignedToId || owner?.id,
      type: "LEAD",
      message: `Follow up ${lead.name}`,
      link: `/leads/${lead.id}`
    })),
    ...tasks.map((task) => ({
      userId: task.assignedToId,
      type: "TASK",
      message: `Task due: ${task.title}`,
      link: "/services"
    })),
    ...invoices.map((invoice) => ({
      userId: owner?.id,
      type: "INVOICE",
      message: `Invoice ${invoice.invoiceNumber} is overdue`,
      link: "/invoices"
    }))
  ].filter((item) => item.userId);

  // Running nightly would otherwise stack an identical row every day until the item is
  // dealt with, so anything already sitting unread is skipped.
  const existing = await prisma.notification.findMany({
    where: { isRead: false, userId: { in: [...new Set(candidates.map((item) => item.userId))] } },
    select: { userId: true, type: true, message: true }
  });
  const seen = new Set(existing.map((item) => `${item.userId}|${item.type}|${item.message}`));

  const fresh = [];
  for (const item of candidates) {
    const key = `${item.userId}|${item.type}|${item.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push({ ...item, isRead: false });
  }
  if (fresh.length) await prisma.notification.createMany({ data: fresh });

  return {
    leads: leads.length,
    tasks: tasks.length,
    invoicesMarkedOverdue: overdueIds.length,
    notificationsCreated: fresh.length,
    notificationsSkipped: candidates.length - fresh.length
  };
}

function registerDailyAlerts() {
  cron.schedule("0 9 * * *", () => {
    runDailyAlerts().catch((error) => console.error("daily-alerts failed", error));
  });
}

module.exports = { registerDailyAlerts, runDailyAlerts };
