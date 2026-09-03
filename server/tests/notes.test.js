const test = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, reset, makeUser, login, req, prisma } = require("./helpers");

/**
 * Personal notes.
 *
 * The feature is only worth having if "private" is true, so most of what follows is not
 * testing that notes work — it is testing that they cannot be read. The sharpest one is
 * that the OWNER is not special: every other section of this CRM lets the owner straight
 * through, and notes deliberately do not.
 */

let amy, bob, boss, portal, gone;
let amyToken, bobToken, bossToken, portalToken;

test.before(async () => {
  await start();
  await reset();

  boss = await makeUser({ email: "boss@test.in", role: "OWNER" });
  amy = await makeUser({ email: "amy@test.in", role: "DESIGNER", permissions: ["content"] });
  bob = await makeUser({ email: "bob@test.in", role: "SEO_EXEC", permissions: ["content"] });
  gone = await makeUser({ email: "gone@test.in", role: "DESIGNER" });
  await prisma.user.update({ where: { id: gone.id }, data: { isActive: false } });

  const client = await prisma.client.create({
    data: { businessName: "Portal Co", contactPerson: "Asha", phone: "9000000009", status: "ACTIVE" }
  });
  portal = await makeUser({ email: "portal@test.in", role: "CLIENT", clientId: client.id });

  bossToken = await login("boss@test.in");
  amyToken = await login("amy@test.in");
  bobToken = await login("bob@test.in");
  portalToken = await login("portal@test.in");
});

test.after(async () => { await stop(); });

test.beforeEach(async () => {
  await prisma.noteShare.deleteMany({});
  await prisma.note.deleteMany({});
  await prisma.notification.deleteMany({});
});

const write = (token, body) => req("/notes", { token, method: "POST", body });

test("a note is private to the person who wrote it", async () => {
  const created = await write(amyToken, { title: "Diwali shoot", body: "call the caterer" });
  assert.equal(created.status, 201);

  const mine = await req("/notes", { token: amyToken });
  assert.equal(mine.body.data.mine.length, 1);

  const theirs = await req("/notes", { token: bobToken });
  assert.equal(theirs.body.data.mine.length, 0);
  assert.equal(theirs.body.data.shared.length, 0);
});

test("the owner is not special: an unshared note is invisible to them too", async () => {
  const created = await write(amyToken, { title: "private", body: "mine alone" });
  const id = created.body.data.id;

  const list = await req("/notes", { token: bossToken });
  assert.equal(list.body.data.mine.length, 0);
  assert.equal(list.body.data.shared.length, 0);

  const edit = await req(`/notes/${id}`, { token: bossToken, method: "PUT", body: { title: "hijacked" } });
  assert.equal(edit.status, 404);

  const removed = await req(`/notes/${id}`, { token: bossToken, method: "DELETE" });
  assert.equal(removed.status, 404);

  const still = await prisma.note.findUnique({ where: { id } });
  assert.equal(still.title, "private");
});

test("someone else's note id is indistinguishable from one that never existed", async () => {
  const created = await write(amyToken, { title: "x" });
  const real = await req(`/notes/${created.body.data.id}`, { token: bobToken, method: "PUT", body: { title: "y" } });
  const invented = await req("/notes/00000000-0000-0000-0000-000000000000", {
    token: bobToken, method: "PUT", body: { title: "y" }
  });
  assert.equal(real.status, 404);
  assert.equal(invented.status, real.status);
});

test("the owner of a note is whoever wrote it, whatever the request claims", async () => {
  const created = await write(amyToken, { title: "spoofed", ownerId: bob.id });
  const stored = await prisma.note.findUnique({ where: { id: created.body.data.id } });
  assert.equal(stored.ownerId, amy.id);
});

test("a client login cannot reach notes at all", async () => {
  const list = await req("/notes", { token: portalToken });
  assert.equal(list.status, 403);
  const created = await write(portalToken, { title: "nope" });
  assert.equal(created.status, 403);
});

test("sharing puts the note in the recipient's list and rings the bell once", async () => {
  const note = await write(amyToken, { title: "Shoot list", body: "lights, tripod" });
  const shared = await req(`/notes/${note.body.data.id}/shares`, {
    token: amyToken, method: "PUT", body: { userIds: [bob.id] }
  });
  assert.equal(shared.status, 200);

  const list = await req("/notes", { token: bobToken });
  assert.equal(list.body.data.shared.length, 1);
  assert.equal(list.body.data.shared[0].title, "Shoot list");
  assert.equal(list.body.data.shared[0].body, "lights, tripod");
  assert.equal(list.body.data.shared[0].owner.name, amy.name);
  // Still not theirs to list as their own.
  assert.equal(list.body.data.mine.length, 0);

  const rung = await prisma.notification.findMany({ where: { userId: bob.id } });
  assert.equal(rung.length, 1);
  assert.match(rung[0].message, /Shoot list/);
  assert.equal(rung[0].link, `/notes?open=${note.body.data.id}`);
});

test("re-saving the same list does not ring the bell again", async () => {
  const note = await write(amyToken, { title: "Same again" });
  const path = `/notes/${note.body.data.id}/shares`;
  await req(path, { token: amyToken, method: "PUT", body: { userIds: [bob.id] } });
  await req(path, { token: amyToken, method: "PUT", body: { userIds: [bob.id] } });

  assert.equal(await prisma.notification.count({ where: { userId: bob.id } }), 1);
  assert.equal(await prisma.noteShare.count({ where: { noteId: note.body.data.id } }), 1);
});

test("revoking takes it off their list, quietly", async () => {
  const note = await write(amyToken, { title: "Briefly yours" });
  const path = `/notes/${note.body.data.id}/shares`;
  await req(path, { token: amyToken, method: "PUT", body: { userIds: [bob.id] } });
  await req(path, { token: amyToken, method: "PUT", body: { userIds: [] } });

  const list = await req("/notes", { token: bobToken });
  assert.equal(list.body.data.shared.length, 0);
  // One bell for the share, and none for taking it away.
  assert.equal(await prisma.notification.count({ where: { userId: bob.id } }), 1);
});

test("a recipient can read what was shared but cannot change or remove it", async () => {
  const note = await write(amyToken, { title: "Read only" });
  const id = note.body.data.id;
  await req(`/notes/${id}/shares`, { token: amyToken, method: "PUT", body: { userIds: [bob.id] } });

  const edit = await req(`/notes/${id}`, { token: bobToken, method: "PUT", body: { title: "rewritten" } });
  assert.equal(edit.status, 404);
  const removed = await req(`/notes/${id}`, { token: bobToken, method: "DELETE" });
  assert.equal(removed.status, 404);
  // And they cannot pass it on.
  const passedOn = await req(`/notes/${id}/shares`, { token: bobToken, method: "PUT", body: { userIds: [boss.id] } });
  assert.equal(passedOn.status, 404);

  assert.equal((await prisma.note.findUnique({ where: { id } })).title, "Read only");
});

test("a note can only be shared with a real, active colleague", async () => {
  const note = await write(amyToken, { title: "Careful" });
  const path = `/notes/${note.body.data.id}/shares`;

  const rejected = {
    "an id that belongs to nobody": "00000000-0000-0000-0000-000000000000",
    "a client login": portal.id,
    "a teammate who was removed": gone.id,
    "yourself": amy.id
  };
  for (const [why, id] of Object.entries(rejected)) {
    const res = await req(path, { token: amyToken, method: "PUT", body: { userIds: [id] } });
    assert.equal(res.status, 422, `${why} should be refused, got ${res.status}`);
  }
  assert.equal(await prisma.noteShare.count({ where: { noteId: note.body.data.id } }), 0);
});

test("deleting a note leaves no shares behind", async () => {
  const note = await write(amyToken, { title: "Gone soon" });
  const id = note.body.data.id;
  await req(`/notes/${id}/shares`, { token: amyToken, method: "PUT", body: { userIds: [bob.id] } });

  const removed = await req(`/notes/${id}`, { token: amyToken, method: "DELETE" });
  assert.equal(removed.status, 200);
  assert.equal(await prisma.noteShare.count({ where: { noteId: id } }), 0);
});

test("a note is refused without a title, and a huge body is refused too", async () => {
  assert.equal((await write(amyToken, { title: "   " })).status, 422);
  assert.equal((await write(amyToken, { title: "ok", body: "x".repeat(20001) })).status, 422);
});

test("the picker lists colleagues and leaks nothing", async () => {
  const res = await req("/team-options", { token: amyToken });
  assert.equal(res.status, 200);

  const ids = res.body.data.map((person) => person.id);
  assert.ok(ids.includes(bob.id), "a colleague is offered");
  assert.ok(ids.includes(boss.id), "so is the owner");
  assert.ok(!ids.includes(amy.id), "you are not in your own picker");
  assert.ok(!ids.includes(portal.id), "a client is never a colleague");
  assert.ok(!ids.includes(gone.id), "a removed teammate is not offered");

  assert.deepEqual(Object.keys(res.body.data[0]).sort(), ["avatar", "id", "name", "role"]);
});
