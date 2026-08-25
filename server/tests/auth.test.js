const test = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, reset, makeUser, login, req, prisma, PASSWORD } = require("./helpers");

test.before(async () => {
  await start();
  await reset();
  await makeUser({ email: "owner@test.in", role: "OWNER" });
  await makeUser({ email: "staff@test.in", role: "ACCOUNT_MANAGER", permissions: ["leads"] });
});
test.after(stop);

const attempt = (email, password) => req("/auth/login", { method: "POST", body: { email, password } });

test("an expired lockout does not leave the account one typo from re-locking", async () => {
  await prisma.user.update({
    where: { email: "staff@test.in" },
    data: { failedLoginCount: 8, lockedUntil: new Date(Date.now() - 60 * 60 * 1000) }
  });

  const wrong = await attempt("staff@test.in", "definitely-wrong");
  assert.equal(wrong.status, 401, "a wrong password is a plain rejection, not a lock");

  const right = await attempt("staff@test.in", PASSWORD);
  assert.equal(right.status, 200, "the correct password must work after an expired lock");
});

test("repeated wrong passwords still lock the account", async () => {
  await prisma.user.update({
    where: { email: "staff@test.in" },
    data: { failedLoginCount: 0, lockedUntil: null }
  });
  let last;
  for (let i = 0; i < 9; i += 1) last = await attempt("staff@test.in", "wrong");
  assert.equal(last.status, 429, "brute force protection must still engage");
});

test("a successful login clears the failure counter", async () => {
  await prisma.user.update({
    where: { email: "staff@test.in" },
    data: { failedLoginCount: 0, lockedUntil: null }
  });
  await attempt("staff@test.in", "wrong");
  await attempt("staff@test.in", PASSWORD);
  const user = await prisma.user.findUnique({ where: { email: "staff@test.in" } });
  assert.equal(user.failedLoginCount, 0);
  assert.equal(user.lockedUntil, null);
});
