const prisma = require("../db/prisma");
const { round } = require("./invoiceStatus");

const monthBounds = (now = new Date()) => ({
  start: new Date(now.getFullYear(), now.getMonth(), 1),
  end: new Date(now.getFullYear(), now.getMonth() + 1, 1)
});

/**
 * Which clients still owe a retainer invoice this month.
 *
 * Billing here is a fixed monthly retainer, so this is derived rather than stored: an
 * active client whose live services total more than zero and who has not yet had a
 * retainer raised this month. Deriving it means there is no billing-run table to
 * disagree with the invoices, and pressing the button twice is harmless.
 *
 * It used to count *any* invoice created this month as proof the client was billed, so
 * raising a ₹500 one-off charge on the 3rd removed their ₹54,000 retainer from the run
 * on the 5th, with nothing to show it had happened. Only `isRetainer` invoices count.
 *
 * This lives here because the Today screen asks the same question, and the two copies
 * would otherwise drift apart.
 */
async function retainerClientsDue(now = new Date()) {
  const { start, end } = monthBounds(now);
  const [clients, alreadyBilled] = await Promise.all([
    prisma.client.findMany({
      where: { status: { in: ["ACTIVE", "ONBOARDING"] } },
      select: {
        id: true, businessName: true, phone: true,
        services: { where: { status: "ACTIVE" }, select: { monthlyValue: true, serviceType: true } }
      },
      orderBy: { businessName: "asc" }
    }),
    prisma.invoice.findMany({
      where: { isRetainer: true, createdAt: { gte: start, lt: end } },
      select: { clientId: true }
    })
  ]);

  const billed = new Set(alreadyBilled.map((invoice) => invoice.clientId));
  return clients
    .map((client) => ({
      id: client.id,
      businessName: client.businessName,
      phone: client.phone,
      amount: round(client.services.reduce((sum, service) => sum + Number(service.monthlyValue || 0), 0)),
      services: client.services.map((service) => service.serviceType)
    }))
    .filter((client) => client.amount > 0 && !billed.has(client.id));
}

module.exports = { retainerClientsDue, monthBounds };
