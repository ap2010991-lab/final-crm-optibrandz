const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { users } = require("../data");
const verifyToken = require("../middleware/verifyToken");
const requireRole = require("../middleware/requireRole");

const router = express.Router();
const publicUser = (user) => ({ ...user, password: undefined });

router.post("/login", async (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(6) }).parse(req.body);
  const user = users.find((item) => item.email.toLowerCase() === body.email.toLowerCase() && item.isActive);
  if (!user || !(await bcrypt.compare(body.password, user.password))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || "dev-secret", { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });
  res.cookie("refreshToken", token, { httpOnly: true, sameSite: "lax" });
  res.json({ token, user: publicUser(user) });
});

router.post("/logout", (_req, res) => {
  res.clearCookie("refreshToken");
  res.json({ ok: true });
});

router.get("/me", verifyToken, (req, res) => res.json({ user: req.user }));

router.post("/invite", verifyToken, requireRole(["OWNER"]), async (req, res) => {
  const body = z.object({ name: z.string(), email: z.string().email(), role: z.enum(["ACCOUNT_MANAGER", "DESIGNER", "SEO_EXEC", "CLIENT"]), phone: z.string().optional() }).parse(req.body);
  const user = { id: `u-${Date.now()}`, ...body, password: await bcrypt.hash("admin123", 12), avatar: body.name.split(" ").map((part) => part[0]).join("").slice(0, 2), isActive: true };
  users.push(user);
  res.status(201).json({ user: publicUser(user), tempPassword: "admin123" });
});

module.exports = router;
