process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-not-used-anywhere-else";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  || "postgresql://alokpandey@localhost:5432/optibrandz_crm_test";
process.env.DIRECT_URL = process.env.DATABASE_URL;

const bcrypt = require("bcrypt");
const prisma = require("../db/prisma");
const app = require("../index");

const PASSWORD = "TestPassword!2026";
let server;
let base;

/** Boots the real Express app on an ephemeral port once per test file. */
async function start() {
  if (base) return base;
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
  return base;
}

async function stop() {
  if (server) await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
  server = null;
  base = null;
}

/** Wipes every table so each file starts from a known state. */
async function reset() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "ContentTask", "MediaAsset", "Notification", "Report", "Activity",
      "CampaignLog", "Invoice", "Task", "ServiceOrder", "ContentCalendar", "Client",
      "Lead", "User", "Settings" RESTART IDENTITY CASCADE;
  `);
}

async function makeUser({ email, role = "OWNER", permissions = [], clientId = null }) {
  return prisma.user.create({
    data: {
      name: `${role} User`,
      email,
      password: await bcrypt.hash(PASSWORD, 4),
      role,
      permissions,
      clientId,
      isActive: true
    }
  });
}

async function login(email) {
  const response = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`login failed for ${email}: ${body.message}`);
  return body.token;
}

/** Thin request helper returning { status, body } so tests can assert on both. */
async function req(path, { token, method = "GET", body, raw } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : raw
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
  return { status: response.status, body: parsed, headers: response.headers };
}

module.exports = { start, stop, reset, makeUser, login, req, prisma, PASSWORD };
