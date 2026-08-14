const express = require("express");
const prisma = require("../db/prisma");
const asyncRoute = require("../utils/asyncRoute");

const router = express.Router();

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function can(user, permission) {
  if (user.role === "OWNER") return true;
  return (user.permissions || []).includes(permission);
}

const monthBounds = (now = new Date()) => ({
  start: new Date(now.getFullYear(), now.getMonth(), 1),
  end: new Date(now.getFullYear(), now.getMonth() + 1, 1)
});

/**
 * Everything the owner needs to act on right now, in one request.
 *
 * The CRM had eleven sections and no answer to "what do I do today", so it was filled in
 * but never worked. Each block below is a thing that can be acted on in one tap, and each
 * is filtered in SQL and gated on the caller's permissions.
 */
router.get("/", asyncRoute(async (req, res) => {
  const user = req.user;
  const today = startOfToday();
  const weekEnd = new Date(today.getTime() + 7 * 86400000);
  const { start: monthStart, end: monthEnd } = monthBounds();

  const [retainerClients, invoicedThisMonth, overdueInvoices, contentDue, plannedThisMonth, activeClients, renewals, staleLeads] =
    await Promise.all([
      // Clients on a monthly retainer are the basis of the billing run.
      can(user, "invoices")
        ? prisma.client.findMany({
            where: { status: { in: ["ACTIVE", "ONBOARDING"] } },
            select: { id: true, businessName: true, phone: true, services: { where: { status: "ACTIVE" }, select: { monthlyValue: true } } }
          })
        : [],
      can(user, "invoices")
        ? prisma.invoice.findMany({
            where: { createdAt: { gte: monthStart, lt: monthEnd } },
            select: { clientId: true }
          })
        : [],
      can(user, "invoices")
        ? prisma.invoice.findMany({
            where: { status: { notIn: ["PAID", "CANCELLED"] }, dueDate: { lt: today } },
            select: {
              id: true, invoiceNumber: true, totalAmount: true, paidAmount: true, dueDate: true, clientPhone: true,
              client: { select: { id: true, businessName: true, contactPerson: true, phone: true } }
            },
            orderBy: { dueDate: "asc" },
            take: 25
          })
        : [],
      can(user, "content")
        ? prisma.contentCalendar.findMany({
            where: { status: { not: "PUBLISHED" }, scheduledDate: { lt: weekEnd } },
            select: {
              id: true, platform: true, postType: true, status: true, scheduledDate: true, caption: true,
              client: { select: { id: true, businessName: true } }
            },
            orderBy: { scheduledDate: "asc" },
            take: 40
          })
        : [],
      can(user, "content")
        ? prisma.contentCalendar.groupBy({
            by: ["clientId"],
            where: { scheduledDate: { gte: monthStart, lt: monthEnd } },
            _count: { _all: true }
          })
        : [],
      can(user, "clients")
        ? prisma.client.findMany({ where: { status: "ACTIVE" }, select: { id: true, businessName: true } })
        : [],
      can(user, "clients")
        ? prisma.client.findMany({
            where: {
              status: { in: ["ACTIVE", "ONBOARDING"] },
              renewalDate: { gte: today, lt: new Date(today.getTime() + 30 * 86400000) }
            },
            select: { id: true, businessName: true, renewalDate: true },
            orderBy: { renewalDate: "asc" },
            take: 10
          })
        : [],
      can(user, "leads")
        ? prisma.lead.findMany({
            where: { status: { notIn: ["CONVERTED", "LOST"] }, followUpDate: { lt: today } },
            select: { id: true, name: true, businessName: true, phone: true, followUpDate: true },
            orderBy: { followUpDate: "asc" },
            take: 15
          })
        : []
    ]);

  const invoicedClientIds = new Set(invoicedThisMonth.map((invoice) => invoice.clientId));
  const toRaise = retainerClients
    .map((client) => ({
      id: client.id,
      businessName: client.businessName,
      phone: client.phone,
      amount: client.services.reduce((sum, service) => sum + Number(service.monthlyValue || 0), 0)
    }))
    .filter((client) => client.amount > 0 && !invoicedClientIds.has(client.id));

  const plannedByClient = new Map(plannedThisMonth.map((row) => [row.clientId, row._count._all]));
  const noContentPlanned = activeClients.filter((client) => !plannedByClient.get(client.id));

  res.json({
    data: {
      money: {
        toRaise,
        toRaiseTotal: toRaise.reduce((sum, client) => sum + client.amount, 0),
        overdue: overdueInvoices.map((invoice) => ({
          ...invoice,
          balance: Math.max(Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0), 0)
        })),
        overdueTotal: overdueInvoices.reduce(
          (sum, invoice) => sum + Math.max(Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0), 0), 0
        )
      },
      content: {
        due: contentDue.map((item) => ({
          ...item,
          overdue: item.scheduledDate ? new Date(item.scheduledDate) < today : false
        }))
      },
      slipping: {
        noContentPlanned: noContentPlanned.map((client) => ({ id: client.id, businessName: client.businessName })),
        renewals,
        staleLeads
      }
    }
  });
}));

module.exports = router;
