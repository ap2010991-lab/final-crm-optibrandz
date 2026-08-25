const test = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, reset, makeUser, login, req, prisma, PASSWORD } = require("./helpers");

let owner;
let staff;

test.before(async () => {
  await start();
  await reset();
  await makeUser({ email: "owner@test.in", role: "OWNER" });
  await makeUser({ email: "staff@test.in", role: "ACCOUNT_MANAGER", permissions: ["leads", "team"] });
  owner = await login("owner@test.in");
  staff = await login("staff@test.in");
});
test.after(stop);

// A test that fails part-way leaves its fixtures behind, so the shared owner is put back
// before every test rather than at the end of the one that changed it. Without this a
// single failure cascades into every later test as a 403.
test.beforeEach(async () => {
  await prisma.user.updateMany({ where: { email: "owner@test.in" }, data: { role: "OWNER", isActive: true } });
  await prisma.user.deleteMany({ where: { email: { in: ["solo-owner@test.in", "second-owner@test.in"] } } });
  owner = await login("owner@test.in");
});

const daysFromNow = (days) => new Date(Date.now() + days * 86400000);

async function makeTask(assignedToId, status, dueDate) {
  return prisma.task.create({ data: { title: `${status} task`, assignedToId, status, dueDate, priority: "MEDIUM" } });
}

test("the workload counts are right with a mix of done, overdue and upcoming", async () => {
  await prisma.task.deleteMany({});
  const designer = await makeUser({ email: "designer@test.in", role: "DESIGNER", permissions: ["content"] });

  // 3 done, 2 overdue and open, 1 upcoming, plus 1 done-but-past-due which is NOT overdue.
  await makeTask(designer.id, "DONE", daysFromNow(-5));
  await makeTask(designer.id, "DONE", daysFromNow(-3));
  await makeTask(designer.id, "DONE", daysFromNow(2));
  await makeTask(designer.id, "PENDING", daysFromNow(-2));
  await makeTask(designer.id, "IN_PROGRESS", daysFromNow(-1));
  await makeTask(designer.id, "PENDING", daysFromNow(5));

  const { body } = await req("/team", { token: owner });
  const row = body.data.find((member) => member.email === "designer@test.in");
  assert.equal(row.totalTasks, 6);
  assert.equal(row.doneTasks, 3);
  assert.equal(row.overdueTasks, 2, "a finished task past its date is not overdue");

  // The card renders this percentage; it must not divide by zero for someone with no work.
  const idle = body.data.find((member) => member.email === "staff@test.in");
  assert.equal(idle.totalTasks, 0);
  assert.equal(idle.doneTasks, 0);
});

test("client portal logins are not listed as team members", async () => {
  const client = await prisma.client.create({
    data: { businessName: "Portal Co", contactPerson: "A", phone: "9000000000", status: "ACTIVE" }
  });
  await makeUser({ email: "portal@test.in", role: "CLIENT", permissions: ["portal"], clientId: client.id });

  const { body } = await req("/team", { token: owner });
  const clients = body.data.filter((member) => member.role === "CLIENT");
  assert.equal(clients.length, 0, "a client portal login is not a colleague and cannot be edited as one");
});

// Run in their own scope: an owner who demotes themselves can no longer reach /team,
// so letting this leak would fail every later test for the wrong reason.
test("the last owner cannot be demoted out of existence", async () => {
  const solo = await makeUser({ email: "solo-owner@test.in", role: "OWNER" });
  const soloToken = await login("solo-owner@test.in");
  // Everyone else is demoted first so this really is the last one standing.
  await prisma.user.updateMany({
    where: { role: "OWNER", NOT: { id: solo.id } },
    data: { role: "ACCOUNT_MANAGER" }
  });

  const demote = await req(`/team/${solo.id}`, { token: soloToken, method: "PUT", body: { role: "DESIGNER" } });
  assert.equal(demote.status, 422, "demoting the only owner locks everyone out of Team and Settings for good");
  assert.equal((await prisma.user.findUnique({ where: { id: solo.id } })).role, "OWNER");

  const deactivate = await req(`/team/${solo.id}`, { token: soloToken, method: "PUT", body: { isActive: false } });
  assert.equal(deactivate.status, 422, "nor may the last owner switch themselves off");

  // With a second owner present, demoting one is allowed again.
  await makeUser({ email: "second-owner@test.in", role: "OWNER" });
  const allowed = await req(`/team/${solo.id}`, { token: soloToken, method: "PUT", body: { role: "ACCOUNT_MANAGER" } });
  assert.equal(allowed.status, 200, "an owner may step down while another remains");

});

test("a removed login can be restored", async () => {
  const target = await prisma.user.findUnique({ where: { email: "staff@test.in" } });
  assert.equal((await req(`/team/${target.id}`, { token: owner, method: "DELETE" })).status, 200);

  const removed = await prisma.user.findUnique({ where: { id: target.id } });
  assert.equal(removed.isActive, false);

  const restored = await req(`/team/${target.id}`, { token: owner, method: "PUT", body: { isActive: true } });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.data.isActive, true, "removing a colleague must not be a one-way door");
});

test("a removed login cannot sign in", async () => {
  const target = await prisma.user.findUnique({ where: { email: "staff@test.in" } });
  await req(`/team/${target.id}`, { token: owner, method: "DELETE" });
  const attempt = await req("/auth/login", { method: "POST", body: { email: "staff@test.in", password: PASSWORD } });
  assert.equal(attempt.status, 401);
  await req(`/team/${target.id}`, { token: owner, method: "PUT", body: { isActive: true } });
});

test("initials survive irregular spacing in a name", async () => {
  const created = await req("/team", {
    token: owner, method: "POST",
    body: { name: "  Rohan   Mehta ", email: "spaced@test.in", password: "password123", role: "DESIGNER", permissions: ["content"] }
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.avatar, "RM", `got "${created.body.data.avatar}"`);
});

test("a duplicate email is refused whatever its casing", async () => {
  const dupe = await req("/team", {
    token: owner, method: "POST",
    body: { name: "Copy Cat", email: "OWNER@TEST.IN", password: "password123", role: "DESIGNER", permissions: ["content"] }
  });
  assert.equal(dupe.status, 409);
});

test("passwords are hashed and never returned", async () => {
  const { body } = await req("/team", { token: owner });
  assert.ok(body.data.every((member) => !("password" in member)), "no password field may be serialised");
  const stored = await prisma.user.findUnique({ where: { email: "spaced@test.in" } });
  assert.match(stored.password, /^\$2[aby]\$/, "must be a bcrypt hash, not plain text");
});

test("only an owner can reach the team panel", async () => {
  // staff has the "team" permission but is not an owner: the role gate must still hold.
  const asStaff = await req("/team", { token: staff });
  assert.equal(asStaff.status, 403);
});

test("editing one field leaves the rest of the login alone", async () => {
  const before = await prisma.user.findUnique({ where: { email: "spaced@test.in" } });
  const { status } = await req(`/team/${before.id}`, { token: owner, method: "PUT", body: { phone: "9876543210" } });
  assert.equal(status, 200);
  const after = await prisma.user.findUnique({ where: { email: "spaced@test.in" } });
  assert.equal(after.password, before.password, "a blank password must not overwrite the real one");
  assert.deepEqual(after.permissions, before.permissions);
  assert.equal(after.role, before.role);
});
