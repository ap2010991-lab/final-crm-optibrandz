const prisma = require("../db/prisma");

const countBy = (rows, key) => rows.reduce((acc, row) => ({ ...acc, [row[key]]: (acc[row[key]] || 0) + 1 }), {});

const toRows = (counts) => Object.entries(counts)
  .sort((a, b) => b[1] - a[1])
  .map(([label, value]) => ({
    label: String(label).toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
    value
  }));

/**
 * Headline figures for a report, recomputed at render time so a downloaded PDF always
 * matches the current records rather than a snapshot from whenever it was generated.
 *
 * Shared by the signed-in route and the public share link so the client and the agency
 * can never be looking at two different sets of numbers.
 */
async function buildReportStats(report) {
  const monthStart = new Date(report.year, report.month - 1, 1);
  const monthEnd = new Date(report.year, report.month, 1);

  const [posted, campaigns, services] = await Promise.all([
    prisma.contentCalendar.findMany({
      where: { clientId: report.clientId, status: "PUBLISHED", scheduledDate: { gte: monthStart, lt: monthEnd } },
      select: { platform: true, postType: true }
    }),
    prisma.campaignLog.findMany({
      where: { clientId: report.clientId, month: report.month, year: report.year },
      select: { adSpend: true, leadsGenerated: true }
    }),
    prisma.serviceOrder.count({ where: { clientId: report.clientId, status: "ACTIVE" } })
  ]);

  const adSpend = campaigns.reduce((sum, row) => sum + Number(row.adSpend || 0), 0);
  const leads = campaigns.reduce((sum, row) => sum + Number(row.leadsGenerated || 0), 0);
  const target = Number(report.client?.monthlyContentTarget) || 0;

  return {
    tiles: [
      { label: target ? `Posts of ${target}` : "Posts published", value: posted.length },
      { label: "Active services", value: services },
      leads ? { label: "Leads generated", value: leads } : null,
      adSpend ? { label: "Ad spend", value: `₹${Math.round(adSpend).toLocaleString("en-IN")}` } : null
    ].filter(Boolean),
    breakdown: [...toRows(countBy(posted, "platform")), ...toRows(countBy(posted, "postType"))]
  };
}

module.exports = { buildReportStats };
