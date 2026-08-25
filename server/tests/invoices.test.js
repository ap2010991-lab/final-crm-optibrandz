const test = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, reset, makeUser, login, req, prisma } = require("./helpers");

let token;

test.before(async () => {
  await start();
  await reset();
  await makeUser({ email: "owner@test.in", role: "OWNER" });
  token = await login("owner@test.in");
});
test.after(stop);

async function clientWithRetainer(name, monthlyValue) {
  const client = await prisma.client.create({
    data: { businessName: name, contactPerson: "X", phone: "9000000000", status: "ACTIVE" }
  });
  await prisma.serviceOrder.create({
    data: { clientId: client.id, serviceType: "SMM", monthlyValue, startDate: new Date(), status: "ACTIVE", deliverables: {} }
  });
  return client;
}

test("a one-off invoice does not suppress that client's monthly retainer", async () => {
  await prisma.invoice.deleteMany({});
  await prisma.serviceOrder.deleteMany({});
  await prisma.client.deleteMany({});
  const client = await clientWithRetainer("Retainer Co", 54000);

  const before = await req("/invoices/run", { token });
  assert.equal(before.body.data.length, 1, "client should be due before any invoice");
  assert.equal(before.body.total, 54000);

  // A small unrelated charge must not look like the monthly retainer.
  const oneOff = await req("/invoices", {
    token, method: "POST",
    body: { clientId: client.id, lineItems: [{ description: "One-off logo tweak", amount: 500 }], dueDate: "2026-09-05" }
  });
  assert.equal(oneOff.status, 201);

  const after = await req("/invoices/run", { token });
  assert.equal(after.body.data.length, 1, "the retainer is still owed after a one-off charge");
  assert.equal(after.body.total, 54000);
});

test("running the billing twice does not double-invoice", async () => {
  await prisma.invoice.deleteMany({});
  const first = await req("/invoices/run", { token, method: "POST", body: {} });
  assert.equal(first.body.created, 1);
  const second = await req("/invoices/run", { token, method: "POST", body: {} });
  assert.equal(second.body.created, 0, "second run must be a no-op");
});

test("revenue keeps months in different years apart", async () => {
  await prisma.invoice.deleteMany({});
  const client = await prisma.client.findFirst();
  const mk = async (createdAt, amount) => {
    const invoice = await req("/invoices", {
      token, method: "POST",
      body: { clientId: client.id, lineItems: [{ description: "x", amount }], dueDate: "2026-09-05" }
    });
    await prisma.invoice.update({ where: { id: invoice.body.data.id }, data: { createdAt } });
  };
  await mk(new Date(Date.UTC(2025, 7, 10)), 1000);
  await mk(new Date(Date.UTC(2026, 7, 10)), 2000);

  // 24 months so both Augusts fall inside the window.
  const { body } = await req("/invoices/revenue?months=24", { token });
  const labels = body.data.map((row) => row.month);
  assert.equal(new Set(labels).size, labels.length, `every bucket must be distinct, got ${labels.join(", ")}`);

  const withMoney = body.data.filter((row) => row.invoiced > 0);
  assert.equal(withMoney.length, 2, `the two Augusts must stay apart, got ${JSON.stringify(withMoney)}`);
  assert.deepEqual(
    withMoney.map((row) => row.invoiced).sort((a, b) => a - b),
    [1000, 2000],
    "amounts must not be summed into one month"
  );
  assert.ok(withMoney.every((row) => /\d{4}/.test(row.month)), "labels carry the year so they cannot be confused");
});

test("a part-paid invoice past its due date is still overdue", async () => {
  const client = await prisma.client.findFirst();
  const created = await req("/invoices", {
    token, method: "POST",
    body: { clientId: client.id, lineItems: [{ description: "Late", amount: 10000 }], dueDate: "2026-05-01" }
  });
  assert.equal(created.body.data.status, "OVERDUE");

  const paid = await req(`/invoices/${created.body.data.id}/pay`, {
    token, method: "PUT", body: { paidAmount: 3000 }
  });
  assert.equal(paid.body.data.paidAmount, 3000, "the part payment is still recorded");
  assert.equal(paid.body.data.status, "OVERDUE", "3 months late and unpaid in full is still overdue");
});

test("invoice numbering stays correct past 999", async () => {
  await prisma.invoice.deleteMany({});
  const client = await prisma.client.findFirst();
  const year = new Date().getFullYear();
  // Both must exist: sorted as text, "999" ranks above "1000", so the next number is
  // computed as 1000 again and collides with the row that already holds it.
  for (const number of [`OB-${year}-999`, `OB-${year}-1000`]) {
    await prisma.invoice.create({
      data: {
        clientId: client.id, invoiceNumber: number, amount: 1, totalAmount: 1, paidAmount: 0,
        gstAmount: 0, status: "PENDING", dueDate: new Date(), lineItems: [{ description: "x", amount: 1 }]
      }
    });
  }
  const next = await req("/invoices", {
    token, method: "POST",
    body: { clientId: client.id, lineItems: [{ description: "x", amount: 1 }], dueDate: "2026-09-05" }
  });
  assert.equal(next.status, 201, `expected a created invoice, got ${JSON.stringify(next.body)}`);
  assert.equal(next.body.data.invoiceNumber, `OB-${year}-1001`);
});
