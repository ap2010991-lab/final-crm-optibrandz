const express = require("express");
const { notifications, leads, clients, invoices, tasks, calendarItems, serviceOrders } = require("../data");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();
router.use(verifyToken);

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function isToday(value) {
  if (!value) return false;
  const date = new Date(value);
  return date >= startOfDay() && date <= endOfDay();
}

function isOverdue(value) {
  if (!value) return false;
  return new Date(value) < startOfDay();
}

function clientName(clientId) {
  return clients.find((client) => client.id === clientId)?.businessName || "Client";
}

function serviceClientName(serviceOrderId) {
  const order = serviceOrders.find((item) => item.id === serviceOrderId);
  return order ? clientName(order.clientId) : "Internal";
}

function buildActionNotifications(user) {
  const assignedTasks = tasks.filter((task) => user.role === "OWNER" || task.assignedToId === user.id);
  const visibleClients = user.role === "CLIENT" ? clients.filter((client) => client.id === user.clientId) : clients;
  const visibleClientIds = new Set(visibleClients.map((client) => client.id));
  const items = [];

  assignedTasks.filter((task) => task.status !== "DONE" && (isToday(task.dueDate) || isOverdue(task.dueDate))).forEach((task) => {
    items.push({
      id: `task-${task.id}`,
      userId: user.id,
      type: "TASK",
      title: isOverdue(task.dueDate) ? "Overdue task" : "Task due today",
      message: `${task.title} · ${serviceClientName(task.serviceOrderId)}`,
      link: "/services",
      dueAt: task.dueDate,
      isRead: false,
      priority: isOverdue(task.dueDate) ? "HIGH" : task.priority || "MEDIUM"
    });
  });

  leads.filter((lead) => !["CONVERTED", "LOST"].includes(lead.status) && (user.role === "OWNER" || lead.assignedToId === user.id) && (isToday(lead.followUpDate) || isOverdue(lead.followUpDate))).forEach((lead) => {
    items.push({
      id: `lead-${lead.id}`,
      userId: user.id,
      type: "LEAD",
      title: isOverdue(lead.followUpDate) ? "Overdue lead follow-up" : "Lead follow-up today",
      message: `${lead.businessName || lead.name} · ${lead.phone}`,
      link: `/leads/${lead.id}`,
      dueAt: lead.followUpDate,
      isRead: false,
      priority: isOverdue(lead.followUpDate) ? "HIGH" : "MEDIUM"
    });
  });

  invoices.filter((invoice) => visibleClientIds.has(invoice.clientId) && invoice.status !== "PAID" && (isToday(invoice.dueDate) || isOverdue(invoice.dueDate))).forEach((invoice) => {
    items.push({
      id: `invoice-${invoice.id}`,
      userId: user.id,
      type: "INVOICE",
      title: isOverdue(invoice.dueDate) ? "Overdue invoice" : "Invoice due today",
      message: `${invoice.invoiceNumber} · ${clientName(invoice.clientId)} · ₹${Number(invoice.totalAmount || 0).toLocaleString("en-IN")}`,
      link: "/invoices",
      dueAt: invoice.dueDate,
      isRead: false,
      priority: isOverdue(invoice.dueDate) ? "HIGH" : "MEDIUM"
    });
  });

  visibleClients.filter((client) => isToday(client.renewalDate) || (client.renewalDate && new Date(client.renewalDate) <= new Date(Date.now() + 7 * 86400000))).forEach((client) => {
    items.push({
      id: `renewal-${client.id}`,
      userId: user.id,
      type: "RENEWAL",
      title: isToday(client.renewalDate) ? "Renewal due today" : "Renewal due soon",
      message: `${client.businessName} renewal · health ${client.healthScore}%`,
      link: `/clients/${client.id}`,
      dueAt: client.renewalDate,
      isRead: false,
      priority: isToday(client.renewalDate) ? "HIGH" : "MEDIUM"
    });
  });

  calendarItems.filter((item) => visibleClientIds.has(item.clientId) && ["DRAFT", "REVIEW"].includes(item.status) && isToday(item.scheduledDate)).forEach((item) => {
    items.push({
      id: `calendar-${item.id}`,
      userId: user.id,
      type: "CONTENT",
      title: "Content scheduled today",
      message: `${clientName(item.clientId)} · ${item.platform} ${item.postType} · ${item.status}`,
      link: `/content?clientId=${item.clientId}`,
      dueAt: item.scheduledDate,
      isRead: false,
      priority: item.status === "REVIEW" ? "HIGH" : "MEDIUM"
    });
  });

  return items.sort((a, b) => new Date(a.dueAt || 0) - new Date(b.dueAt || 0));
}

router.get("/", (req, res) => {
  const saved = notifications.filter((item) => item.userId === req.user.id);
  const actionItems = buildActionNotifications(req.user);
  res.json({ data: [...actionItems, ...saved].slice(0, 50), meta: { actionCount: actionItems.length } });
});

router.put("/read-all", (req, res) => {
  notifications.filter((item) => item.userId === req.user.id).forEach((item) => { item.isRead = true; });
  res.json({ ok: true });
});

module.exports = router;
