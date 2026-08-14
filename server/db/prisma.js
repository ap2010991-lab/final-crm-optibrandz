const { PrismaClient } = require("@prisma/client");

const globalForPrisma = globalThis;

// A serverless function is frozen between requests rather than torn down, so the client
// (and its established database connections) must be reused. This used to attach to
// globalThis only outside production, which is exactly backwards: it is production that
// pays for a fresh connection handshake on every module re-evaluation.
const prisma = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"]
});

globalForPrisma.prisma = prisma;

module.exports = prisma;
