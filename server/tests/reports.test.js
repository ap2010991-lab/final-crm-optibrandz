const test = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, reset, makeUser, login, req, prisma } = require("./helpers");

let ownerToken;
let staffToken;
let clientId;

test.before(async () => {
  await start();
  await reset();
  await makeUser({ email: "owner@test.in", role: "OWNER" });
  await makeUser({ email: "am@test.in", role: "ACCOUNT_MANAGER", permissions: ["reports", "clients"] });
  ownerToken = await login("owner@test.in");
  staffToken = await login("am@test.in");
  const client = await prisma.client.create({
    data: { businessName: "Report Co", contactPerson: "X", phone: "9000000000", status: "ACTIVE" }
  });
  clientId = client.id;
});
test.after(stop);

test("a post counts in the month it actually went out, not the month it was planned for", async () => {
  await prisma.contentCalendar.deleteMany({});
  // Planned for 31 August, actually posted on 2 September.
  await prisma.contentCalendar.create({
    data: {
      clientId, month: 8, year: 2026, platform: "INSTAGRAM", postType: "REEL", status: "PUBLISHED",
      scheduledDate: new Date(2026, 7, 31), publishedAt: new Date(2026, 8, 2)
    }
  });

  const august = await req("/reports/generate", {
    token: ownerToken, method: "POST", body: { clientId, month: 8, year: 2026 }
  });
  assert.match(august.body.data.summary, /No posts were published/, "it did not go out in August");

  const september = await req("/reports/generate", {
    token: ownerToken, method: "POST", body: { clientId, month: 9, year: 2026 }
  });
  assert.match(september.body.data.summary, /Published 1 post/, "it went out in September");
});

test("posts from before publishedAt existed still count by their scheduled date", async () => {
  await prisma.contentCalendar.deleteMany({});
  await prisma.contentCalendar.create({
    data: {
      clientId, month: 7, year: 2026, platform: "INSTAGRAM", postType: "STATIC", status: "PUBLISHED",
      scheduledDate: new Date(2026, 6, 10), publishedAt: null
    }
  });
  const { body } = await req("/reports/generate", {
    token: ownerToken, method: "POST", body: { clientId, month: 7, year: 2026 }
  });
  assert.match(body.data.summary, /Published 1 post/, "legacy rows must not silently vanish from reports");
});

test("regenerating a month replaces the report rather than stacking duplicates", async () => {
  await prisma.report.deleteMany({});
  await req("/reports/generate", { token: ownerToken, method: "POST", body: { clientId, month: 6, year: 2026 } });
  await req("/reports/generate", { token: ownerToken, method: "POST", body: { clientId, month: 6, year: 2026 } });
  const reports = await prisma.report.findMany({ where: { clientId, month: 6, year: 2026 } });
  assert.equal(reports.length, 1, "one month, one report");
});

test("only the owner can delete a published report", async () => {
  const report = await prisma.report.findFirst();
  const asStaff = await req(`/reports/${report.id}`, { token: staffToken, method: "DELETE" });
  assert.equal(asStaff.status, 403, "a destructive action must match the rest of the CRM");
  const asOwner = await req(`/reports/${report.id}`, { token: ownerToken, method: "DELETE" });
  assert.equal(asOwner.status, 200);
});
