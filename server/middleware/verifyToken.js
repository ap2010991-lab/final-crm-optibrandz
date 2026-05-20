const jwt = require("jsonwebtoken");
const { users } = require("../data");

function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Missing bearer token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
    const user = users.find((item) => item.id === payload.id && item.isActive);
    if (!user) return res.status(401).json({ message: "User not found" });
    req.user = { ...user, password: undefined };
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = verifyToken;
