function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Missing user" });
    if (req.user.role === "OWNER") return next();
    if ((req.user.permissions || []).includes(permission)) return next();
    return res.status(403).json({ message: "This login does not have access to this CRM section" });
  };
}

module.exports = requirePermission;
