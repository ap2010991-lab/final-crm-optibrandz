const express = require("express");
const prisma = require("../db/prisma");
const asyncRoute = require("../utils/asyncRoute");

const router = express.Router();

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

// An invoice is overdue the moment its due date passes, whether or not the nightly job
// has run yet. Reading it this way means the dashboard is never stale.
function effectiveStatus(invoice, today) {
  if (["PAID", "CANCELLED"].includes(invoice.status)) return invoice.status;
  if (invoice.dueDate && new Date(invoice.dueDate) < today) return "OVERDUE";
  return invoice.status;
}

router.get("/", asyncRoute(async (_req, res) => {
  const now = new Date();
  const today = startOfToday();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  // Every one of these used to be an unrestricted findMany that pulled every column,
  // including long text fields the dashboard never reads. Selecting only what is
  // aggregated keeps the response small and the query cheap as the CRM grows.
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const [clients, leads, rawInvoices, tasks, serviceOrders, campaigns, contentInReview, users] = await Promise.all([
    prisma.client.findMany({
      select: { id: true, businessName: true, status: true, totalValue: true, advancePaid: true, renewalDate: true }
    }),
    prisma.lead.findMany({
      select: { id: true, status: true, createdAt: true, followUpDate: true }
    }),
    prisma.invoice.findMany({
      select: { id: true, invoiceNumber: true, status: true, totalAmount: true, paidAmount: true, dueDate: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.task.findMany({
      select: { id: true, title: true, status: true, priority: true, dueDate: true, assignedToId: true }
    }),
    prisma.serviceOrder.findMany({
      select: { serviceType: true, status: true, monthlyValue: true }
    }),
    prisma.campaignLog.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { platform: true, adSpend: true, leadsGenerated: true, cpl: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.contentCalendar.count({ where: { status: "REVIEW" } }),
    prisma.user.findMany({
      where: { isActive: true, role: { not: "CLIENT" } },
      select: { id: true, name: true, role: true }
    })
  ]);
  const invoices = rawInvoices.map((invoice) => ({ ...invoice, status: effectiveStatus(invoice, today) }));

  const activeClients = clients.filter((client) => client.status === "ACTIVE");
  const activeOrders = serviceOrders.filter((order) => order.status === "ACTIVE");
  const mrr = activeOrders.reduce((sum, order) => sum + Number(order.monthlyValue || 0), 0);
  const contractedValue = activeClients.reduce((sum, client) => sum + Number(client.totalValue || 0), 0);
  const advanceReceived = activeClients.reduce((sum, client) => sum + Number(client.advancePaid || 0), 0);
  const dealBalanceDue = Math.max(contractedValue - advanceReceived, 0);
  const billable = invoices.filter((invoice) => invoice.status !== "CANCELLED");
  const totalOutstanding = billable
    .filter((invoice) => invoice.status !== "PAID")
    .reduce((sum, invoice) => sum + Math.max(Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0), 0), 0);
  const collected = billable.reduce((sum, invoice) => sum + Number(invoice.paidAmount || 0), 0);
  const invoiced = billable.reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0);
  const convertedLeads = leads.filter((lead) => lead.status === "CONVERTED").length;
  const conversionRate = leads.length ? Math.round(convertedLeads / leads.length * 100) : 0;
  const statuses = ["NEW", "CONTACTED", "DEMO_SCHEDULED", "PROPOSAL_SENT", "NEGOTIATION", "CONVERTED", "LOST"];

  // Revenue trend used to be invented from MRR (mrr * 0.72, then +6% a month) with real
  // invoices added on top, so the chart never matched the books. It is now the real
  // invoiced and collected totals per month, with empty months shown as zero.
  const monthBuckets = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      month: date.toLocaleDateString("en-IN", { month: "short" }),
      invoiced: 0,
      collected: 0
    };
  });
  const bucketByKey = new Map(monthBuckets.map((bucket) => [bucket.key, bucket]));
  billable.forEach((invoice) => {
    const created = new Date(invoice.createdAt || invoice.dueDate || Date.now());
    const bucket = bucketByKey.get(`${created.getFullYear()}-${created.getMonth()}`);
    if (!bucket) return;
    bucket.invoiced += Number(invoice.totalAmount || 0);
    bucket.collected += Number(invoice.paidAmount || 0);
  });

  const invoiceStatuses = ["PAID", "PARTIAL", "PENDING", "OVERDUE"];
  const taskStatuses = ["PENDING", "IN_PROGRESS", "REVIEW", "DONE"];
  const renewalWindow = new Date(Date.now() + 30 * 86400000);

  res.json({ data: {
    totalActiveClients: activeClients.length,
    mrr,
    contractedValue,
    advanceReceived,
    dealBalanceDue,
    totalOutstanding,
    collectionRate: invoiced ? Math.round(collected / invoiced * 100) : 0,
    invoicedTotal: invoiced,
    collectedTotal: collected,
    activeServicesCount: activeOrders.length,
    contentInReview,
    campaignLeads: campaigns.reduce((sum, item) => sum + Number(item.leadsGenerated || 0), 0),
    newLeadsThisWeek: leads.filter((lead) => lead.status === "NEW" && (!lead.createdAt || new Date(lead.createdAt) >= weekAgo)).length,
    conversionRate,
    renewalsDueSoon: clients
      .filter((client) => client.renewalDate && new Date(client.renewalDate) >= today && new Date(client.renewalDate) <= renewalWindow)
      .map((client) => ({ id: client.id, businessName: client.businessName, renewalDate: client.renewalDate })),
    overdueInvoices: invoices
      .filter((invoice) => invoice.status === "OVERDUE")
      .map((invoice) => ({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, totalAmount: invoice.totalAmount, dueDate: invoice.dueDate })),
    overdueTasksCount: tasks.filter((task) => new Date(task.dueDate) < today && task.status !== "DONE").length,
    idleLeadsCount: leads.filter((lead) => lead.followUpDate && new Date(lead.followUpDate) < today && !["CONVERTED", "LOST"].includes(lead.status)).length,
    revenueChart: monthBuckets.map(({ month, invoiced: inv, collected: col }) => ({ month, invoiced: inv, collected: col })),
    leadFunnel: statuses.map((status) => ({ status, count: leads.filter((lead) => lead.status === status).length })),
    activeClientsByService: Object.entries(activeOrders.reduce((acc, order) => ({ ...acc, [order.serviceType]: (acc[order.serviceType] || 0) + 1 }), {})).map(([service, count]) => ({ service, count })),
    invoiceStatusChart: invoiceStatuses.map((status) => ({ status, count: invoices.filter((invoice) => invoice.status === status).length })),
    taskStatusChart: taskStatuses.map((status) => ({ status, count: tasks.filter((task) => task.status === status).length })),
    teamLoad: users.map((user) => {
      const mine = tasks.filter((task) => task.assignedToId === user.id);
      return { name: user.name.split(" ")[0], total: mine.length, overdue: mine.filter((task) => new Date(task.dueDate) < today && task.status !== "DONE").length };
    }),
    priorityTasks: tasks.filter((task) => ["HIGH", "URGENT"].includes(task.priority) && task.status !== "DONE").slice(0, 5),
    topCampaigns: campaigns.slice(0, 4).map((campaign) => ({ platform: campaign.platform, leadsGenerated: campaign.leadsGenerated, cpl: campaign.cpl, adSpend: campaign.adSpend })),
    recentInvoices: invoices.slice(0, 4).map((invoice) => ({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, status: invoice.status, totalAmount: invoice.totalAmount, dueDate: invoice.dueDate }))
  } });
}));

module.exports = router;
