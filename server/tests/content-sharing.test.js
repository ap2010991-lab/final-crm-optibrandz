const test = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, reset, makeUser, makeClient, login, req, prisma } = require("./helpers");

let owner, designer, seo, manager, portal, client;

/** Invites a colleague through the real API and signs in with the one-time password it
 *  returns, so these tests run against the permissions an invite actually grants. */
async function invite(name, email, role) {
  const { status, body } = await req("/auth/invite", { token: owner, method: "POST", body: { name, email, role } });
  assert.equal(status, 201, `invite failed for ${email}: ${JSON.stringify(body)}`);
  const signIn = await req("/auth/login", { method: "POST", body: { email, password: body.tempPassword } });
  assert.equal(signIn.status, 200, `the invited login could not sign in: ${JSON.stringify(signIn.body)}`);
  return signIn.body.token;
}

test.before(async () => {
  await start();
  await reset();
  client = await prisma.client.create({
    data: { businessName: "Shared Co", contactPerson: "Asha", phone: "9000000001", status: "ACTIVE" }
  });

  await makeUser({ email: "owner@test.in", role: "OWNER" });
  owner = await login("owner@test.in");

  designer = await invite("Kinjal Patel", "designer@test.in", "DESIGNER");
  seo = await invite("Rohan Mehta", "seo@test.in", "SEO_EXEC");
  manager = await invite("Nisha Shah", "manager@test.in", "ACCOUNT_MANAGER");

  await makeUser({ email: "portal@test.in", role: "CLIENT", permissions: ["portal"], clientId: client.id });
  portal = await login("portal@test.in");
});
test.after(stop);

test("every staff role invited into the CRM can reach the shared content plan", async () => {
  for (const [who, token] of [["owner", owner], ["designer", designer], ["seo exec", seo], ["account manager", manager]]) {
    const tasks = await req(`/content-tasks?clientId=${client.id}`, { token });
    assert.equal(tasks.status, 200, `${who} must see the shared to-do list`);
    const calendar = await req(`/calendar?clientId=${client.id}&month=8&year=2026`, { token });
    assert.equal(calendar.status, 200, `${who} must see the shared content calendar`);
  }
});

test("a client portal login still cannot reach either", async () => {
  assert.equal((await req(`/content-tasks?clientId=${client.id}`, { token: portal })).status, 403);
  assert.equal((await req(`/calendar?clientId=${client.id}`, { token: portal })).status, 403);
});

test("the whole team works one shared list, not a copy each", async () => {
  const added = await req("/content-tasks", {
    token: designer, method: "POST",
    body: { clientId: client.id, title: "Festive reel", type: "REEL" }
  });
  assert.equal(added.status, 201);

  // Everyone else sees the designer's task without adding it themselves.
  for (const token of [owner, seo, manager]) {
    const { body } = await req(`/content-tasks?clientId=${client.id}`, { token });
    assert.ok(body.data.some((task) => task.id === added.body.data.id), "one list, shared");
  }
});

test("a task records who added it and who finished it", async () => {
  const added = await req("/content-tasks", {
    token: designer, method: "POST",
    body: { clientId: client.id, title: "Shot by one, posted by another", type: "POST" }
  });
  assert.equal(added.body.data.createdBy.name, "Kinjal Patel");
  assert.equal(added.body.data.completedBy, null, "an open task has finished by nobody");

  // A different colleague ticks it off.
  const done = await req(`/content-tasks/${added.body.data.id}/toggle`, { token: seo, method: "PUT" });
  assert.equal(done.body.data.completedBy.name, "Rohan Mehta", "credit goes to whoever actually posted it");
  assert.equal(done.body.data.createdBy.name, "Kinjal Patel", "and the author is unchanged");
  assert.ok(done.body.data.completedAt);
});

test("re-opening a task clears who finished it", async () => {
  const added = await req("/content-tasks", {
    token: owner, method: "POST", body: { clientId: client.id, title: "Reopen me", type: "STORY" }
  });
  const id = added.body.data.id;
  await req(`/content-tasks/${id}/toggle`, { token: seo, method: "PUT" });
  const reopened = await req(`/content-tasks/${id}/toggle`, { token: seo, method: "PUT" });
  assert.equal(reopened.body.data.isDone, false);
  assert.equal(reopened.body.data.completedAt, null);
  assert.equal(reopened.body.data.completedById, null, "an open task must not still name a finisher");
});

test("the PUT path credits the finisher too, not just the toggle", async () => {
  const added = await req("/content-tasks", {
    token: owner, method: "POST", body: { clientId: client.id, title: "Marked done by edit", type: "POST" }
  });
  const done = await req(`/content-tasks/${added.body.data.id}`, {
    token: manager, method: "PUT", body: { isDone: true }
  });
  assert.equal(done.body.data.completedBy.name, "Nisha Shah");
});

test("a task never carries a password or email out to the client", async () => {
  const { body } = await req(`/content-tasks?clientId=${client.id}`, { token: owner });
  const withPeople = body.data.filter((task) => task.createdBy);
  assert.ok(withPeople.length > 0);
  for (const task of withPeople) {
    assert.deepEqual(Object.keys(task.createdBy).sort(), ["avatar", "id", "name"], "only what the card renders");
  }
});

test("removing a colleague keeps the record of the work they did", async () => {
  // Their own colleague to remove: deactivating a shared fixture would invalidate that
  // token and fail every later test for the wrong reason.
  const leaver = await invite("Priya Leaver", "leaver@test.in", "DESIGNER");
  const added = await req("/content-tasks", {
    token: leaver, method: "POST", body: { clientId: client.id, title: "Their last reel", type: "REEL" }
  });
  await req(`/content-tasks/${added.body.data.id}/toggle`, { token: leaver, method: "PUT" });

  const leaverRow = await prisma.user.findUnique({ where: { email: "leaver@test.in" } });
  await req(`/team/${leaverRow.id}`, { token: owner, method: "DELETE" });

  const { body } = await req(`/content-tasks?clientId=${client.id}`, { token: owner });
  const task = body.data.find((entry) => entry.id === added.body.data.id);
  assert.ok(task, "the task survives");
  assert.equal(task.completedBy.name, "Priya Leaver", "and still shows who did it");
});

test("a colleague can name a client without being given the clients section", async () => {
  // Every designer the CRM invites gets `content` but not `clients`. The content screens
  // pick a client first, so without this the page never loads anything at all.
  assert.equal((await req("/clients", { token: designer })).status, 403, "their account stays private");

  const options = await req("/client-options", { token: designer });
  assert.equal(options.status, 200, "but they can still choose which client they are posting for");
  assert.ok(options.body.data.some((entry) => entry.id === client.id));
});

test("the picker never leaks what a client is worth", async () => {
  const { body } = await req("/client-options", { token: designer });
  for (const entry of body.data) {
    assert.deepEqual(
      Object.keys(entry).sort(),
      ["businessName", "contactPerson", "id", "phone"],
      "contract value, advance paid, GST number and health score must not appear"
    );
  }
});

test("a client portal login cannot list the agency's other clients", async () => {
  assert.equal((await req("/client-options", { token: portal })).status, 403);
});
