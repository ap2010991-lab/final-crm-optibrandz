const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const prisma = require("../db/prisma");
const verifyToken = require("../middleware/verifyToken");
const requireRole = require("../middleware/requireRole");
const asyncRoute = require("../utils/asyncRoute");
const { defaultStaffPermissions, clientPermissions } = require("../utils/constants");

const router = express.Router();
const publicUser = (user) => ({ ...user, password: undefined, failedLoginCount: undefined, lockedUntil: undefined });
const initials = (name) => name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

const MAX_FAILED_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  });
}

function setSessionCookie(res, token) {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

// The owner password was printed in a public README, so repeated guesses now lock the
// account for a while. The counter lives on the user row because serverless functions
// do not share in-process memory.
router.post("/login", asyncRoute(async (req, res) => {
  const body = z.object({
    email: z.string().email(),
    password: z.string().min(1).max(200)
  }).parse(req.body);

  const user = await prisma.user.findFirst({
    where: { email: { equals: body.email, mode: "insensitive" }, isActive: true }
  });
  const invalid = () => res.status(401).json({ message: "Invalid email or password" });
  if (!user) {
    await bcrypt.compare(body.password, "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin");
    return invalid();
  }

  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    const minutes = Math.max(1, Math.ceil((new Date(user.lockedUntil) - Date.now()) / 60000));
    return res.status(429).json({ message: `Too many failed attempts. Try again in ${minutes} minute(s).` });
  }

  // Serving the lockout used to leave the counter sitting on the threshold, so the very
  // next wrong password re-locked the account — and the correct one was then refused too.
  // Anyone who tripped it once was permanently one typo from being locked out again.
  // An expired lock has been served: the slate is clean.
  const priorFailures = user.lockedUntil ? 0 : (user.failedLoginCount || 0);

  if (!(await bcrypt.compare(body.password, user.password))) {
    const failedLoginCount = priorFailures + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount,
        lockedUntil: failedLoginCount >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60000) : null
      }
    });
    return invalid();
  }

  if (user.failedLoginCount || user.lockedUntil) {
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  }


  const token = signToken(user);
  setSessionCookie(res, token);
  res.json({ token, user: publicUser(user) });
}));

router.post("/logout", (_req, res) => {
  res.clearCookie("refreshToken", { path: "/" });
  res.json({ ok: true });
});

router.get("/me", verifyToken, (req, res) => res.json({ user: publicUser(req.user) }));

router.put("/password", verifyToken, asyncRoute(async (req, res) => {
  const body = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, "Use at least 8 characters.").max(200)
  }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user || !(await bcrypt.compare(body.currentPassword, user.password))) {
    return res.status(401).json({ message: "Your current password is not correct." });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { password: await bcrypt.hash(body.newPassword, 12), failedLoginCount: 0, lockedUntil: null }
  });
  res.json({ ok: true });
}));

// Invited users used to all receive the same hard-coded "admin123". Each invite now
// gets its own random one-time password, returned once to the owner who invited them.
router.post("/invite", verifyToken, requireRole(["OWNER"]), asyncRoute(async (req, res) => {
  const body = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    role: z.enum(["ACCOUNT_MANAGER", "DESIGNER", "SEO_EXEC", "CLIENT"]),
    phone: z.string().optional()
  }).parse(req.body);
  const exists = await prisma.user.findFirst({ where: { email: { equals: body.email, mode: "insensitive" } } });
  if (exists) return res.status(409).json({ message: "That email already has a login." });

  const permissions = body.role === "CLIENT" ? clientPermissions
    : body.role === "DESIGNER" ? [...defaultStaffPermissions, "services"]
      : body.role === "SEO_EXEC" ? [...defaultStaffPermissions, "services", "campaigns"]
        : [...defaultStaffPermissions, "leads", "clients"];
  const tempPassword = crypto.randomBytes(9).toString("base64url");
  const user = await prisma.user.create({
    data: {
      ...body,
      permissions,
      password: await bcrypt.hash(tempPassword, 12),
      avatar: initials(body.name),
      isActive: true
    }
  });
  res.status(201).json({ user: publicUser(user), tempPassword });
}));

module.exports = router;
