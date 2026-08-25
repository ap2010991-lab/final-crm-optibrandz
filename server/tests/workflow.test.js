const test = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, reset, makeUser, login, req, prisma } = require("./helpers");
const { runDailyAlerts } = require("../jobs/daily-alerts.job");
const { runRenewalAlerts } = require("../jobs/renewal-alerts.job");

let token;
let clientId;

test.before(async () => {
  await start();
  await reset();
  await makeUser({ email: "owner@test.in", role: "OWNER" });
  token = await login("owner@test.in");
  const client = await prisma.client.create({
    data: {
      businessName: "Workflow Co", contactPerson: "X", phone: "9000000000",
      status: "ACTIVE", renewalDate: new Date(Date.now() + 10 * 86400000)
    }
  });
  clientId = client.id;
});
test.after(stop);

const daysFromNow = (days) => new Date(Date.now() + days * 86400000);

test("Today's content list is not crowded out by months-old drafts", async () => {
  await prisma.contentCalendar.deleteMany({});
  // 45 stale drafts from well before this month, then 3 that are genuinely due now.
  for (let i = 0; i < 45; i += 1) {
    await prisma.contentCalendar.create({
      data: {
        clientId, month: 1, year: 2026, platform: "INSTAGRAM", postType: "STATIC",
        status: "DRAFT", scheduledDate: new Date(2026, 0, (i % 28) + 1)
      }
    });
  }
  for (let i = 0; i < 3; i += 1) {
    await prisma.contentCalendar.create({
      data: {
        clientId, month: new Date().getMonth() + 1, year: new Date().getFullYear(),
        platform: "INSTAGRAM", postType: "REEL", status: "DRAFT", scheduledDate: daysFromNow(i)
      }
    });
  }

  const { body } = await req("/today", { token });
  const due = body.data.content.due;
  const reels = due.filter((item) => item.postType === "REEL");
  assert.equal(reels.length, 3, "what is due this week must always be visible");
});

test("the action centre reports each item once, not twice", async () => {
  await prisma.notification.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.invoice.create({
    data: {
      clientId, invoiceNumber: "OB-2026-900", amount: 5000, totalAmount: 5000, paidAmount: 0,
      gstAmount: 0, status: "PENDING", dueDate: daysFromNow(-10),
      lineItems: [{ description: "x", amount: 5000 }]
    }
  });

  await runDailyAlerts();
  await runRenewalAlerts();

  const { body } = await req("/notifications", { token });
  const mentions = body.data.filter((item) => (item.message || "").includes("OB-2026-900"));
  assert.equal(mentions.length, 1, `the same invoice must not be listed twice: ${JSON.stringify(mentions)}`);
});

test("the nightly job still marks overdue invoices", async () => {
  const invoice = await prisma.invoice.findFirst({ where: { invoiceNumber: "OB-2026-900" } });
  assert.equal(invoice.status, "OVERDUE");
});

test("running the renewal job twice does not duplicate anything", async () => {
  const { body: first } = await req("/notifications", { token });
  await runRenewalAlerts();
  const { body: second } = await req("/notifications", { token });
  assert.equal(second.data.length, first.data.length, "a second run must add nothing");
});

test("the alert count reaches zero once the work is done", async () => {
  await prisma.invoice.deleteMany({});
  await prisma.contentCalendar.deleteMany({});
  await prisma.lead.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.client.updateMany({ data: { renewalDate: null } });
  await prisma.notification.deleteMany({});

  const { body } = await req("/notifications", { token });
  assert.equal(body.data.length, 0, `nothing outstanding must mean an empty bell: ${JSON.stringify(body.data)}`);
});

test("content awaiting approval is what the dashboard reports", async () => {
  await prisma.contentCalendar.deleteMany({});
  await prisma.contentCalendar.create({
    data: { clientId, month: 8, year: 2026, platform: "INSTAGRAM", postType: "STATIC", status: "IN_DESIGN" }
  });
  const { body } = await req("/dashboard", { token });
  assert.equal(body.data.contentAwaitingApproval, 1, "the KPI must track a stage the pipeline actually uses");
});

test("marking a post published stamps when it went out", async () => {
  const post = await prisma.contentCalendar.create({
    data: { clientId, month: 8, year: 2026, platform: "INSTAGRAM", postType: "REEL", status: "APPROVED" }
  });
  const { body } = await req(`/calendar/${post.id}`, { token, method: "PUT", body: { status: "PUBLISHED" } });
  assert.ok(body.data.publishedAt, "publishedAt must be recorded so reports can be accurate");
});

test("marking a post approved stamps when it was approved", async () => {
  const post = await prisma.contentCalendar.create({
    data: { clientId, month: 8, year: 2026, platform: "INSTAGRAM", postType: "REEL", status: "IN_DESIGN" }
  });
  const { body } = await req(`/calendar/${post.id}`, { token, method: "PUT", body: { status: "APPROVED" } });
  assert.ok(body.data.approvedAt, "approvedAt must be recorded");
});
