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

function can(user, permission) {
  if (user.role === "OWNER") return true;
  return (user.permissions || []).includes(permission);
}

const isOverdue = (value) => (value ? new Date(value) < startOfDay() : false);

/**
 * The action centre is polled from the app shell on every screen, so it has to be cheap.
 *
 * It used to load six entire tables and filter them in JavaScript. Now each section is
 * both permission-gated and filtered in SQL, selecting only the columns that end up in
 * the response, so the query cost stays flat as the CRM fills up.
 */
async function buildActionNotifications(user) {
  const dayEnd = endOfDay();
  const dayStart = startOfDay();
  const mine = user.role === "OWNER" ? {} : { assignedToId: user.id };

  const [tasks, leads, invoices, renewals, calendarItems] = await Promise.all([
    prisma.task.findMany({
      where: { ...mine, status: { not: "DONE" }, dueDate: { lte: dayEnd } },
      select: { id: true, title: true, dueDate: true, priority: true, serviceOrderId: true },
      orderBy: { dueDate: "asc" },
      take: 40
    }),
    can(user, "leads")
      ? prisma.lead.findMany({
          where: { ...mine, status: { notIn: ["CONVERTED", "LOST"] }, followUpDate: { lte: dayEnd } },
          select: { id: true, name: true, businessName: true, phone: true, followUpDate: true },
          orderBy: { followUpDate: "asc" },
          take: 40
        })
      : [],
    can(user, "invoices")
      ? prisma.invoice.findMany({
          where: {
            status: { notIn: ["PAID", "CANCELLED"] },
            dueDate: { lte: dayEnd },
            ...(user.role === "CLIENT" ? { clientId: user.clientId || "__none__" } : {})
          },
          select: { id: true, invoiceNumber: true, totalAmount: true, dueDate: true, client: { select: { businessName: true } } },
          orderBy: { dueDate: "asc" },
          take: 40
        })
      : [],
    can(user, "clients")
      ? prisma.client.findMany({
          where: {
            status: { in: ["ACTIVE", "ONBOARDING"] },
            renewalDate: { gte: dayStart, lte: new Date(Date.now() + 7 * 86400000) },
            ...(user.role === "CLIENT" ? { id: user.clientId || "__none__" } : {})
          },
          select: { id: true, businessName: true, healthScore: true, renewalDate: true },
          orderBy: { renewalDate: "asc" },
          take: 20
        })
      : [],
    can(user, "content")
      ? prisma.contentCalendar.findMany({
          where: {
            // Was DRAFT/REVIEW. REVIEW was dropped from the pipeline long ago, and
            // IN_DESIGN and APPROVED are most of it, so a post due today that had been
            // started or signed off never raised anything.
            status: { not: "PUBLISHED" },
            scheduledDate: { gte: dayStart, lte: dayEnd },
            ...(user.role === "CLIENT" ? { clientId: user.clientId || "__none__" } : {})
          },
          select: { id: true, clientId: true, platform: true, postType: true, status: true, scheduledDate: true, client: { select: { businessName: true } } },
          take: 40
        })
      : []
  ]);

  // Only the service orders actually referenced by the tasks above, so a client name can
  // be shown without pulling every service order in the CRM.
  const serviceOrderIds = [...new Set(tasks.map((task) => task.serviceOrderId).filter(Boolean))];
  const serviceOrders = serviceOrderIds.length
    ? await prisma.serviceOrder.findMany({
        where: { id: { in: serviceOrderIds } },
        select: { id: true, client: { select: { businessName: true } } }
      })
    : [];
  const serviceClientName = (id) => serviceOrders.find((order) => order.id === id)?.client?.businessName || "Internal";

  const items = [];

  tasks.forEach((task) => items.push({
    id: `task-${task.id}`, userId: user.id, type: "TASK",
    title: isOverdue(task.dueDate) ? "Overdue task" : "Task due today",
    message: `${task.title} · ${serviceClientName(task.serviceOrderId)}`,
    link: "/services", dueAt: task.dueDate, isRead: false,
    priority: isOverdue(task.dueDate) ? "HIGH" : task.priority || "MEDIUM"
  }));

  leads.forEach((lead) => items.push({
    id: `lead-${lead.id}`, userId: user.id, type: "LEAD",
    title: isOverdue(lead.followUpDate) ? "Overdue lead follow-up" : "Lead follow-up today",
    message: `${lead.businessName || lead.name} · ${lead.phone}`,
    link: `/leads/${lead.id}`, dueAt: lead.followUpDate, isRead: false,
    priority: isOverdue(lead.followUpDate) ? "HIGH" : "MEDIUM"
  }));

  invoices.forEach((invoice) => items.push({
    id: `invoice-${invoice.id}`, userId: user.id, type: "INVOICE",
    title: isOverdue(invoice.dueDate) ? "Overdue invoice" : "Invoice due today",
    message: `${invoice.invoiceNumber} · ${invoice.client?.businessName || "Client"} · ₹${Number(invoice.totalAmount || 0).toLocaleString("en-IN")}`,
    link: "/invoices", dueAt: invoice.dueDate, isRead: false,
    priority: isOverdue(invoice.dueDate) ? "HIGH" : "MEDIUM"
  }));

  renewals.forEach((client) => items.push({
    id: `renewal-${client.id}`, userId: user.id, type: "RENEWAL",
    title: new Date(client.renewalDate) <= dayEnd ? "Renewal due today" : "Renewal due soon",
    message: `${client.businessName} renewal · health ${client.healthScore}%`,
    link: `/clients/${client.id}`, dueAt: client.renewalDate, isRead: false,
    priority: new Date(client.renewalDate) <= dayEnd ? "HIGH" : "MEDIUM"
  }));

  calendarItems.forEach((item) => items.push({
    id: `calendar-${item.id}`, userId: user.id, type: "CONTENT",
    title: "Content scheduled today",
    message: `${item.client?.businessName || "Client"} · ${item.platform} ${item.postType} · ${item.status}`,
    link: `/content?clientId=${item.clientId}`, dueAt: item.scheduledDate, isRead: false,
    priority: item.status === "APPROVED" ? "HIGH" : "MEDIUM"
  }));

  return items.sort((a, b) => new Date(a.dueAt || 0) - new Date(b.dueAt || 0));
}

router.get("/", asyncRoute(async (req, res) => {
  const [saved, actionItems] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: req.user.id, isRead: false },
      select: { id: true, type: true, message: true, link: true, isRead: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 30
    }),
    buildActionNotifications(req.user)
  ]);
  // `savedCount` lets the panel offer "Mark all read" only when there is something a
  // read flag can actually clear. Live items are cleared by doing the work, not by
  // dismissing them, and the button used to promise otherwise.
  res.json({
    data: [...actionItems, ...saved].slice(0, 50),
    meta: { actionCount: actionItems.length, savedCount: saved.length }
  });
}));

router.put("/read-all", asyncRoute(async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user.id }, data: { isRead: true } });
  res.json({ ok: true });
}));

module.exports = router;
