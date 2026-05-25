const express = require("express");
const prisma = require("../db/prisma");
const asyncRoute = require("../utils/asyncRoute");

const router = express.Router();

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
  return value ? new Date(value) < startOfDay() : false;
}

async function buildActionNotifications(user) {
  const [clients, leads, invoices, tasks, calendarItems, serviceOrders] = await Promise.all([
    prisma.client.findMany({ where: user.role === "CLIENT" ? { id: user.clientId } : {} }),
    prisma.lead.findMany(),
    prisma.invoice.findMany(),
    prisma.task.findMany(),
    prisma.contentCalendar.findMany(),
    prisma.serviceOrder.findMany()
  ]);
  const visibleClientIds = new Set(clients.map((client) => client.id));
  const clientName = (clientId) => clients.find((client) => client.id === clientId)?.businessName || "Client";
  const serviceClientName = (serviceOrderId) => {
    const order = serviceOrders.find((item) => item.id === serviceOrderId);
    return order ? clientName(order.clientId) : "Internal";
  };
  const items = [];

  tasks.filter((task) => (user.role === "OWNER" || task.assignedToId === user.id) && task.status !== "DONE" && (isToday(task.dueDate) || isOverdue(task.dueDate))).forEach((task) => {
    items.push({ id: `task-${task.id}`, userId: user.id, type: "TASK", title: isOverdue(task.dueDate) ? "Overdue task" : "Task due today", message: `${task.title} · ${serviceClientName(task.serviceOrderId)}`, link: "/services", dueAt: task.dueDate, isRead: false, priority: isOverdue(task.dueDate) ? "HIGH" : task.priority || "MEDIUM" });
  });

  leads.filter((lead) => !["CONVERTED", "LOST"].includes(lead.status) && (user.role === "OWNER" || lead.assignedToId === user.id) && (isToday(lead.followUpDate) || isOverdue(lead.followUpDate))).forEach((lead) => {
    items.push({ id: `lead-${lead.id}`, userId: user.id, type: "LEAD", title: isOverdue(lead.followUpDate) ? "Overdue lead follow-up" : "Lead follow-up today", message: `${lead.businessName || lead.name} · ${lead.phone}`, link: `/leads/${lead.id}`, dueAt: lead.followUpDate, isRead: false, priority: isOverdue(lead.followUpDate) ? "HIGH" : "MEDIUM" });
  });

  invoices.filter((invoice) => visibleClientIds.has(invoice.clientId) && invoice.status !== "PAID" && (isToday(invoice.dueDate) || isOverdue(invoice.dueDate))).forEach((invoice) => {
    items.push({ id: `invoice-${invoice.id}`, userId: user.id, type: "INVOICE", title: isOverdue(invoice.dueDate) ? "Overdue invoice" : "Invoice due today", message: `${invoice.invoiceNumber} · ${clientName(invoice.clientId)} · ₹${Number(invoice.totalAmount || 0).toLocaleString("en-IN")}`, link: "/invoices", dueAt: invoice.dueDate, isRead: false, priority: isOverdue(invoice.dueDate) ? "HIGH" : "MEDIUM" });
  });

  clients.filter((client) => isToday(client.renewalDate) || (client.renewalDate && new Date(client.renewalDate) <= new Date(Date.now() + 7 * 86400000))).forEach((client) => {
    items.push({ id: `renewal-${client.id}`, userId: user.id, type: "RENEWAL", title: isToday(client.renewalDate) ? "Renewal due today" : "Renewal due soon", message: `${client.businessName} renewal · health ${client.healthScore}%`, link: `/clients/${client.id}`, dueAt: client.renewalDate, isRead: false, priority: isToday(client.renewalDate) ? "HIGH" : "MEDIUM" });
  });

  calendarItems.filter((item) => visibleClientIds.has(item.clientId) && ["DRAFT", "REVIEW"].includes(item.status) && isToday(item.scheduledDate)).forEach((item) => {
    items.push({ id: `calendar-${item.id}`, userId: user.id, type: "CONTENT", title: "Content scheduled today", message: `${clientName(item.clientId)} · ${item.platform} ${item.postType} · ${item.status}`, link: `/content?clientId=${item.clientId}`, dueAt: item.scheduledDate, isRead: false, priority: item.status === "REVIEW" ? "HIGH" : "MEDIUM" });
  });

  return items.sort((a, b) => new Date(a.dueAt || 0) - new Date(b.dueAt || 0));
}

router.get("/", asyncRoute(async (req, res) => {
  const [saved, actionItems] = await Promise.all([
    prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "desc" } }),
    buildActionNotifications(req.user)
  ]);
  res.json({ data: [...actionItems, ...saved].slice(0, 50), meta: { actionCount: actionItems.length } });
}));

router.put("/read-all", asyncRoute(async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user.id }, data: { isRead: true } });
  res.json({ ok: true });
}));

module.exports = router;
