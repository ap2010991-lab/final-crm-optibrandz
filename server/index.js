require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const verifyToken = require("./middleware/verifyToken");
const requirePermission = require("./middleware/requirePermission");

const app = express();
const port = process.env.PORT || 3001;

const allowedOrigins = new Set([
  process.env.CLIENT_URL || "http://localhost:5173",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked origin ${origin}`));
  },
  credentials: true
}));
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => res.json({ ok: true, name: "OptiBrandz CRM API" }));
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/dashboard", verifyToken, requirePermission("dashboard"), require("./routes/dashboard.routes"));
app.use("/api/leads", verifyToken, requirePermission("leads"), require("./routes/leads.routes"));
app.use("/api/clients", verifyToken, requirePermission("clients"), require("./routes/clients.routes"));
app.use("/api/services", verifyToken, requirePermission("services"), require("./routes/services.routes"));
app.use("/api/tasks", verifyToken, requirePermission("services"), require("./routes/tasks.routes"));
app.use("/api/calendar", verifyToken, requirePermission("content"), require("./routes/calendar.routes"));
app.use("/api/invoices", verifyToken, requirePermission("invoices"), require("./routes/invoices.routes"));
app.use("/api/campaigns", verifyToken, requirePermission("campaigns"), require("./routes/campaigns.routes"));
app.use("/api/reports", require("./routes/reports.routes"));
app.use("/api/notifications", require("./routes/notifications.routes"));
app.use("/api/search", require("./routes/search.routes"));
app.use("/api/ai", require("./routes/ai.routes"));
app.use("/api/team", require("./routes/team.routes"));

app.use((err, _req, res, _next) => {
  const status = err.name === "ZodError" ? 422 : 500;
  res.status(status).json({ message: err.message || "Server error", issues: err.issues });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`OptiBrandz CRM API running on http://localhost:${port}`);
  });
}

module.exports = app;
