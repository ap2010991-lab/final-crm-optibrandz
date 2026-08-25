const test = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, reset, makeUser, login, req, prisma } = require("./helpers");

let token;
let clientId;

test.before(async () => {
  await start();
  await reset();
  await makeUser({ email: "owner@test.in", role: "OWNER" });
  token = await login("owner@test.in");
  const client = await prisma.client.create({
    data: { businessName: "Validation Co", contactPerson: "X", phone: "9000000000", status: "ACTIVE" }
  });
  clientId = client.id;
});
test.after(stop);

// Every one of these reached Prisma and surfaced as a 500 before the fix. A rejected
// value is a client error, and the CRM can only show a useful message for a 4xx.
const cases = [
  ["POST", "/services", () => ({ clientId, serviceType: "BOGUS", monthlyValue: 100 })],
  ["POST", "/services", () => ({ clientId, serviceType: "SEO", monthlyValue: 100, status: "BOGUS" })],
  ["POST", "/leads", () => ({ name: "Test Person", phone: "9999999999", source: "BOGUS" })],
  ["POST", "/leads", () => ({ name: "Test Person", phone: "9999999999", status: "BOGUS" })],
  ["POST", "/calendar", () => ({ clientId, month: 8, year: 2026, platform: "BOGUS" })],
  ["POST", "/calendar", () => ({ clientId, month: 8, year: 2026, postType: "BOGUS" })],
  ["POST", "/campaigns", () => ({ clientId, month: 99, year: 2026, platform: "INSTAGRAM" })],
  ["POST", "/campaigns", () => ({ clientId, month: 8, year: 2026, platform: "BOGUS" })]
];

for (const [method, path, makeBody] of cases) {
  test(`${method} ${path} rejects a bad enum with 4xx, not 500`, async () => {
    const { status, body } = await req(path, { token, method, body: makeBody() });
    assert.ok(status >= 400 && status < 500, `expected 4xx, got ${status} ${JSON.stringify(body)}`);
  });
}

test("PUT /clients rejects an unknown status with 4xx", async () => {
  const { status } = await req(`/clients/${clientId}`, { token, method: "PUT", body: { status: "BOGUS" } });
  assert.ok(status >= 400 && status < 500, `expected 4xx, got ${status}`);
});

test("a valid enum value is still accepted", async () => {
  const { status } = await req("/services", {
    token, method: "POST", body: { clientId, serviceType: "SEO", monthlyValue: 5000 }
  });
  assert.equal(status, 201);
});

test("an unknown client id is a 4xx rather than a foreign-key 500", async () => {
  const { status } = await req("/campaigns", {
    token, method: "POST", body: { clientId: "does-not-exist", month: 8, year: 2026, platform: "INSTAGRAM" }
  });
  assert.ok(status >= 400 && status < 500, `expected 4xx, got ${status}`);
});

test("search with a blank or one-character query returns nothing", async () => {
  const blank = await req("/search?q=", { token });
  assert.deepEqual(blank.body.data, { clients: [], leads: [], invoices: [] });
  const single = await req("/search?q=a", { token });
  assert.deepEqual(single.body.data, { clients: [], leads: [], invoices: [] });
});

test("search still finds a real match", async () => {
  const { body } = await req("/search?q=Validation", { token });
  assert.equal(body.data.clients.length, 1);
});
