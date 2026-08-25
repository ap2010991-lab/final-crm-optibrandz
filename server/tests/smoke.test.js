const test = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, reset, makeUser, login, req, prisma } = require("./helpers");

let owner;
let designer;
let clientLogin;
let clientId;

test.before(async () => {
  await start();
  await reset();
  await makeUser({ email: "owner@test.in", role: "OWNER" });
  await makeUser({ email: "designer@test.in", role: "DESIGNER", permissions: ["dashboard", "content", "services"] });
  owner = await login("owner@test.in");
  designer = await login("designer@test.in");
});
test.after(stop);

// A full lifecycle for every entity. Anything that 500s, or silently succeeds when it
// should not, shows up here rather than in front of a client.
test("a client can be created, read, updated and deleted", async () => {
  const created = await req("/clients", {
    token: owner, method: "POST",
    body: { businessName: "Smoke Co", contactPerson: "A", phone: "9000000000", services: ["SEO"], mrr: 10000 }
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  clientId = created.body.data.id;

  const read = await req(`/clients/${clientId}`, { token: owner });
  assert.equal(read.status, 200);
  assert.equal(read.body.data.mrr, 10000, "the retainer must be split across the active services");

  const updated = await req(`/clients/${clientId}`, { token: owner, method: "PUT", body: { city: "Vapi" } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.city, "Vapi");
  assert.equal(updated.body.data.totalValue, read.body.data.totalValue, "a partial edit must not reset other fields");
});

test("advance received cannot exceed the contract value", async () => {
  const { status } = await req(`/clients/${clientId}`, {
    token: owner, method: "PUT", body: { totalValue: 1000, advancePaid: 5000 }
  });
  assert.equal(status, 422);
});

test("a lead runs through to conversion exactly once", async () => {
  const lead = await req("/leads", {
    token: owner, method: "POST",
    body: { name: "Smoke Lead", phone: "9111111111", serviceInterest: ["SMM"], source: "REFERRAL" }
  });
  assert.equal(lead.status, 201);

  const first = await req(`/leads/${lead.body.data.id}/convert`, { token: owner, method: "POST" });
  assert.equal(first.status, 201);
  const second = await req(`/leads/${lead.body.data.id}/convert`, { token: owner, method: "POST" });
  assert.equal(second.status, 200);
  assert.equal(second.body.alreadyConverted, true, "converting twice must not create a second client");
  assert.equal(second.body.data.id, first.body.data.id);
});

test("a content post runs the whole pipeline", async () => {
  const post = await req("/calendar", {
    token: designer, method: "POST",
    body: { clientId, month: 8, year: 2026, platform: "INSTAGRAM", postType: "REEL" }
  });
  assert.equal(post.status, 201, JSON.stringify(post.body));
  const id = post.body.data.id;

  for (const status of ["IN_DESIGN", "APPROVED", "PUBLISHED"]) {
    const step = await req(`/calendar/${id}`, { token: designer, method: "PUT", body: { status } });
    assert.equal(step.status, 200, `${status}: ${JSON.stringify(step.body)}`);
    assert.equal(step.body.data.status, status);
  }
  const final = await req(`/calendar/${id}`, { token: designer, method: "PUT", body: { caption: "Just a caption" } });
  assert.equal(final.body.data.status, "PUBLISHED", "editing a caption must not reset the stage");
  assert.equal(final.body.data.platform, "INSTAGRAM", "nor the platform");
});

test("a to-do runs its whole lifecycle", async () => {
  const created = await req("/content-tasks", {
    token: designer, method: "POST", body: { clientId, title: "Smoke reel", type: "REEL" }
  });
  assert.equal(created.status, 201);
  const id = created.body.data.id;

  const ticked = await req(`/content-tasks/${id}/toggle`, { token: designer, method: "PUT" });
  assert.equal(ticked.body.data.isDone, true);
  assert.ok(ticked.body.data.completedAt);

  const unticked = await req(`/content-tasks/${id}/toggle`, { token: designer, method: "PUT" });
  assert.equal(unticked.body.data.isDone, false);
  assert.equal(unticked.body.data.completedAt, null);

  const renamed = await req(`/content-tasks/${id}`, { token: designer, method: "PUT", body: { title: "Renamed" } });
  assert.equal(renamed.body.data.type, "REEL", "a partial edit must not reset the kind");

  assert.equal((await req(`/content-tasks/${id}`, { token: designer, method: "DELETE" })).status, 200);
});

test("permissions are enforced per section", async () => {
  // A designer has content and services, but no money and no client list.
  assert.equal((await req("/invoices", { token: designer })).status, 403);
  assert.equal((await req("/leads", { token: designer })).status, 403);
  assert.equal((await req("/clients", { token: designer })).status, 403);
  assert.equal((await req("/team", { token: designer })).status, 403);
  assert.equal((await req("/calendar?clientId=" + clientId, { token: designer })).status, 200);
});

test("a client login sees only its own records", async () => {
  const client = await prisma.client.findFirst({ where: { businessName: "Smoke Co" } });
  const other = await prisma.client.create({
    data: { businessName: "Someone Else", contactPerson: "B", phone: "9222222222", status: "ACTIVE" }
  });
  await makeUser({ email: "portal@test.in", role: "CLIENT", permissions: ["portal", "invoices"], clientId: client.id });
  clientLogin = await login("portal@test.in");

  await prisma.invoice.create({
    data: {
      clientId: other.id, invoiceNumber: "OB-2026-777", amount: 1, totalAmount: 1, paidAmount: 0, gstAmount: 0,
      status: "PENDING", dueDate: new Date(), lineItems: [{ description: "x", amount: 1 }]
    }
  });

  const { body } = await req("/invoices", { token: clientLogin });
  const leaked = body.data.filter((invoice) => invoice.clientId !== client.id);
  assert.equal(leaked.length, 0, "a client must never see another client's invoices");
});

test("unknown ids are 404, not 500", async () => {
  for (const path of ["/clients/nope", "/leads/nope", "/invoices/nope", "/reports/nope"]) {
    const { status } = await req(path, { token: owner });
    assert.equal(status, 404, `${path} returned ${status}`);
  }
});

test("deleting a client cascades without orphaning anything", async () => {
  const target = await prisma.client.findFirst({ where: { businessName: "Smoke Co" } });
  assert.equal((await req(`/clients/${target.id}`, { token: owner, method: "DELETE" })).status, 200);
  for (const [label, count] of [
    ["service orders", await prisma.serviceOrder.count({ where: { clientId: target.id } })],
    ["invoices", await prisma.invoice.count({ where: { clientId: target.id } })],
    ["content", await prisma.contentCalendar.count({ where: { clientId: target.id } })],
    ["to-dos", await prisma.contentTask.count({ where: { clientId: target.id } })]
  ]) {
    assert.equal(count, 0, `${label} left behind`);
  }
});
