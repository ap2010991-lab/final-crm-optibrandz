const cron = require("node-cron");
const prisma = require("../db/prisma");
const { invoiceStatus, startOfToday } = require("../utils/invoiceStatus");

/**
 * Marks invoices that have gone past their due date.
 *
 * This used to also file a Notification row per overdue lead, task and invoice. The
 * action centre derives exactly the same items live on every request, so each one was
 * reported to the owner twice in the same panel, worded differently — confirmed with
 * five overdue invoices appearing as ten entries. Worse, the persisted copies could not
 * be cleared by fixing the underlying record, so the bell never went back to zero.
 *
 * The live derivation is the single source now. What is kept here is the part that is a
 * genuine state change and not a view: an invoice whose due date has passed is overdue,
 * and that belongs on the record.
 *
 * Exported so it runs both from node-cron on a long-lived host and from the
 * /api/cron/daily endpoint that Vercel Cron calls.
 */
async function runDailyAlerts() {
  const today = startOfToday();

  const candidates = await prisma.invoice.findMany({
    where: { status: { notIn: ["PAID", "CANCELLED", "OVERDUE"] }, dueDate: { lt: today } },
    select: { id: true, totalAmount: true, paidAmount: true, dueDate: true, status: true }
  });

  // Asking the shared helper rather than assuming, so the job can never disagree with
  // what the write path and the dashboard call the same invoice.
  const overdueIds = candidates
    .filter((invoice) => invoiceStatus(invoice, today) === "OVERDUE")
    .map((invoice) => invoice.id);

  if (overdueIds.length) {
    await prisma.invoice.updateMany({ where: { id: { in: overdueIds } }, data: { status: "OVERDUE" } });
  }

  return { invoicesMarkedOverdue: overdueIds.length, checked: candidates.length };
}

function registerDailyAlerts() {
  cron.schedule("0 9 * * *", () => {
    runDailyAlerts().catch((error) => console.error("daily-alerts failed", error));
  });
}

module.exports = { registerDailyAlerts, runDailyAlerts };
