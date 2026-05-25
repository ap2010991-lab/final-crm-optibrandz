const jwt = require("jsonwebtoken");
const prisma = require("../db/prisma");

async function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Missing bearer token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findFirst({ where: { id: payload.id, isActive: true } });
    if (!user) return res.status(401).json({ message: "User not found" });
    req.user = { ...user, password: undefined };
    next();
  } catch (err) {
    next(err.name === "JsonWebTokenError" || err.name === "TokenExpiredError" ? Object.assign(new Error("Invalid or expired token"), { status: 401 }) : err);
  }
}

module.exports = verifyToken;
