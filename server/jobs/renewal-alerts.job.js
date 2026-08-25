const prisma = require("../db/prisma");

/**
 * Renewals coming up.
 *
 * This job existed only to insert a Notification row per upcoming renewal per user, with
 * no de-duplication at all, so every monthly run added another copy of every renewal
 * already on screen. Both the action centre and the Today screen derive renewals live
 * from `Client.renewalDate`, which cannot go stale and cannot accumulate.
 *
 * It is kept as a read-only report so the cron endpoint that calls it still answers, and
 * so there is one place to hang a real notification channel (email or WhatsApp) if the
 * agency ever wants pushing rather than pulling.
 */
async function runRenewalAlerts() {
  const clients = await prisma.client.findMany({
    where: {
      status: { in: ["ACTIVE", "ONBOARDING"] },
      renewalDate: { gte: new Date(), lt: new Date(Date.now() + 30 * 86400000) }
    },
    select: { id: true, businessName: true, renewalDate: true },
    orderBy: { renewalDate: "asc" }
  });
  return { clients: clients.length, upcoming: clients };
}

module.exports = { runRenewalAlerts };
