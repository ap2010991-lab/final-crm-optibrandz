// Defects found in the 2026-11-24 audit. Each test failed before its fix.
const test = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, reset, makeUser, login, req, prisma } = require("./helpers");

let ownerToken, designerToken, managerToken;
let clientId;

test.before(async () => {
  await start();
  await reset();
  await makeUser({ email: "owner@test.in", role: "OWNER" });
  // Exactly the logins the agency has in production.
  await makeUser({ email: "designer@test.in", role: "DESIGNER", permissions: ["dashboard", "content"] });
  await makeUser({ email: "am@test.in", role: "ACCOUNT_MANAGER", permissions: ["services", "content"] });
  ownerToken = await login("owner@test.in");
  designerToken = await login("designer@test.in");
  managerToken = await login("am@test.in");
  const client = await prisma.client.create({
    data: { businessName: "Audit Co", contactPerson: "A", phone: "9000000001", status: "ACTIVE", totalValue: 90000, advancePaid: 10000 }
  });
  clientId = client.id;
  await prisma.serviceOrder.create({
    data: { clientId, serviceType: "SMM", packageName: "Custom", monthlyValue: 25000, startDate: new Date(), status: "ACTIVE", deliverables: {} }
  });
  await prisma.invoice.create({
    data: {
      clientId, invoiceNumber: "OB-2026-001", lineItems: [{ description: "x", amount: 25000 }],
      amount: 25000, gstAmount: 0, totalAmount: 25000, paidAmount: 0, status: "PENDING",
      dueDate: new Date(Date.now() - 5 * 86400000)
    }
  });
});
test.after(stop);

test("the dashboard does not show money to a login without the invoices or clients section", async () => {
  const { status, body } = await req("/dashboard", { token: designerToken });
  assert.equal(status, 200);
  const d = body.data;
  assert.equal(d.mrr, 0, "MRR is client money");
  assert.equal(d.contractedValue, 0);
  assert.equal(d.totalOutstanding, 0, "outstanding is invoice money");
  assert.equal(d.invoicedTotal, 0);
  assert.deepEqual(d.overdueInvoices, []);
  assert.deepEqual(d.recentInvoices, []);

  const owner = (await req("/dashboard", { token: ownerToken })).body.data;
  assert.equal(owner.mrr, 25000, "the owner still sees everything");
  assert.equal(owner.totalOutstanding, 25000);
});

test("an unknown enum in a list filter is the caller's mistake, not a 500", async () => {
  for (const path of ["/clients?status=NOPE", "/invoices?status=NOPE", "/leads?status=NOPE", "/calendar?status=NOPE"]) {
    const { status } = await req(path, { token: ownerToken });
    assert.equal(status, 422, path);
  }
});

test("an invoice past its due date reads as overdue before the nightly job has run", async () => {
  const { body } = await req("/invoices", { token: ownerToken });
  assert.equal(body.data[0].status, "OVERDUE");
});

test("a post created as published or approved is stamped like one moved there", async () => {
  const published = await req("/calendar", {
    token: ownerToken, method: "POST",
    body: { clientId, month: 11, year: 2026, status: "PUBLISHED", scheduledDate: new Date().toISOString() }
  });
  assert.equal(published.status, 201);
  assert.ok(published.body.data.publishedAt, "publishedAt is what the monthly report counts");
  assert.ok(published.body.data.approvedAt, "a published post was approved");

  const approved = await req("/calendar", {
    token: ownerToken, method: "POST", body: { clientId, month: 11, year: 2026, status: "APPROVED" }
  });
  assert.ok(approved.body.data.approvedAt);
  assert.equal(approved.body.data.publishedAt, null);
});

test("clearing a post's date does not 500", async () => {
  const created = await req("/calendar", {
    token: ownerToken, method: "POST",
    body: { clientId, month: 11, year: 2026, scheduledDate: new Date().toISOString() }
  });
  const cleared = await req(`/calendar/${created.body.data.id}`, {
    token: ownerToken, method: "PUT", body: { scheduledDate: "" }
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.data.scheduledDate, null);
});

test("a colleague who may add tasks can see who to assign them to, themselves included", async () => {
  const { status, body } = await req("/team-options?includeSelf=1", { token: managerToken });
  assert.equal(status, 200);
  const emails = body.data.map((person) => person.email);
  assert.ok(emails.every((email) => email === undefined), "a picker never carries an email");
  assert.equal(body.data.length, 3, "owner, designer and the manager themself");

  const withoutSelf = await req("/team-options", { token: managerToken });
  assert.equal(withoutSelf.body.data.length, 2, "the note-sharing picker still leaves you out");
});

test("a services-only colleague can pick a client for a service", async () => {
  const { status, body } = await req("/client-options", { token: managerToken });
  assert.equal(status, 200);
  assert.equal(body.data[0].id, clientId);
  assert.equal(body.data[0].totalValue, undefined, "contract value stays private");
});
