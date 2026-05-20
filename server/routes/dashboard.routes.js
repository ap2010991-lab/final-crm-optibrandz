const express = require("express");
const { clients, leads, invoices, tasks, serviceOrders } = require("../data");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();
router.use(verifyToken);

router.get("/", (_req, res) => {
  const activeClients = clients.filter((client) => client.status === "ACTIVE");
  const mrr = serviceOrders.filter((order) => order.status === "ACTIVE").reduce((sum, order) => sum + order.monthlyValue, 0);
  const totalOutstanding = invoices.filter((invoice) => invoice.status !== "PAID").reduce((sum, invoice) => sum + invoice.totalAmount - (invoice.paidAmount || 0), 0);
  const statuses = ["NEW", "CONTACTED", "DEMO_SCHEDULED", "PROPOSAL_SENT", "NEGOTIATION", "CONVERTED", "LOST"];
  res.json({ data: {
    totalActiveClients: activeClients.length,
    mrr,
    totalOutstanding,
    newLeadsThisWeek: leads.filter((lead) => lead.status === "NEW").length,
    conversionRate: 32,
    renewalsDueSoon: clients.filter((client) => client.renewalDate && new Date(client.renewalDate) < new Date(Date.now() + 30 * 86400000)),
    overdueInvoices: invoices.filter((invoice) => invoice.status === "OVERDUE"),
    overdueTasksCount: tasks.filter((task) => new Date(task.dueDate) < new Date() && task.status !== "DONE").length,
    idleLeadsCount: leads.filter((lead) => new Date(lead.followUpDate) < new Date() && !["CONVERTED", "LOST"].includes(lead.status)).length,
    revenueChart: ["Jan", "Feb", "Mar", "Apr", "May"].map((month, index) => ({ month, invoiced: 90000 + index * 22000, collected: 76000 + index * 19000 })),
    leadFunnel: statuses.map((status) => ({ status, count: leads.filter((lead) => lead.status === status).length })),
    activeClientsByService: Object.entries(serviceOrders.reduce((acc, order) => ({ ...acc, [order.serviceType]: (acc[order.serviceType] || 0) + 1 }), {})).map(([service, count]) => ({ service, count }))
  } });
});

module.exports = router;
