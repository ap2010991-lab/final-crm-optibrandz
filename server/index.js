require("dotenv").config();
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is required in production.");
  process.exit(1);
}
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const verifyToken = require("./middleware/verifyToken");
const requirePermission = require("./middleware/requirePermission");
const requireRole = require("./middleware/requireRole");
const { isAllowedOrigin } = require("./utils/allowedOrigins");
const { mapPrismaError } = require("./utils/prismaErrors");

const app = express();
const port = process.env.PORT || 3001;

// The API and the React build are served from the same origin in production, but
// browsers still send an Origin header on same-origin POST/PUT/DELETE. Rejecting an
// unknown origin with an Error made every write fail with HTTP 500, so unknown
// origins are now simply refused CORS headers instead of crashing the request.
app.use(cors({
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin, app.locals.currentHost));
  },
  credentials: true
}));

// Remember the host we are actually served on so same-origin requests are always
// recognised, whatever preview/production URL Vercel assigns to this deployment.
app.use((req, _res, next) => {
  if (req.headers.host) app.locals.currentHost = req.headers.host;
  next();
});

// Vercel rejects request bodies above 4.5 MB before they reach this function.
app.use(express.json({ limit: "4mb" }));
app.use(cookieParser());
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true, name: "OptiBrandz CRM API" }));
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/public/invoices", require("./routes/public-invoices.routes"));
app.use("/api/public/reports", require("./routes/public-reports.routes"));
app.use("/api/public/media", require("./routes/public-media.routes"));
app.use("/api/cron", require("./routes/cron.routes"));
app.use("/api/settings", verifyToken, require("./routes/settings.routes"));
app.use("/api/today", verifyToken, requirePermission("dashboard"), require("./routes/today.routes"));
app.use("/api/dashboard", verifyToken, requirePermission("dashboard"), require("./routes/dashboard.routes"));
app.use("/api/leads", verifyToken, requirePermission("leads"), require("./routes/leads.routes"));
app.use("/api/clients", verifyToken, requirePermission("clients"), require("./routes/clients.routes"));
app.use("/api/services", verifyToken, requirePermission("services"), require("./routes/services.routes"));
app.use("/api/tasks", verifyToken, requirePermission("services"), require("./routes/tasks.routes"));
// Any colleague may name a client; only the clients section exposes their account.
app.use("/api/client-options", verifyToken, require("./routes/client-options.routes"));
app.use("/api/calendar", verifyToken, requirePermission("content"), require("./routes/calendar.routes"));
app.use("/api/content-tasks", verifyToken, requirePermission("content"), require("./routes/content-tasks.routes"));
app.use("/api/invoices", verifyToken, requirePermission("invoices"), require("./routes/invoices.routes"));
app.use("/api/campaigns", verifyToken, requirePermission("campaigns"), require("./routes/campaigns.routes"));
app.use("/api/reports", verifyToken, requirePermission("reports"), require("./routes/reports.routes"));
app.use("/api/notifications", verifyToken, require("./routes/notifications.routes"));
app.use("/api/search", verifyToken, require("./routes/search.routes"));
app.use("/api/ai", verifyToken, requirePermission("ai"), require("./routes/ai.routes"));
app.use("/api/team", verifyToken, requireRole(["OWNER"]), requirePermission("team"), require("./routes/team.routes"));

app.use("/api", (_req, res) => res.status(404).json({ message: "API route not found" }));

app.use((err, _req, res, _next) => {
  // A rejected value is the caller's mistake, so it must not be reported as a server
  // fault: a 500 tells the CRM nothing it can show and hides real faults in the noise.
  const mapped = mapPrismaError(err);
  const status = err.status || (err.name === "ZodError" ? 422 : mapped?.status || 500);
  if (status >= 500) console.error(err);

  // Zod already explains which value was wrong and what was expected; passing that
  // through is far more useful than a generic "some fields are not filled in correctly".
  const zodMessage = err.name === "ZodError"
    ? (err.issues || [])
        .map((issue) => (issue.path?.length ? `${issue.path.join(".")}: ` : "") + issue.message)
        .slice(0, 3)
        .join(" ")
    : null;

  const message = zodMessage
    || mapped?.message
    || (status >= 500 && process.env.NODE_ENV === "production"
      ? "Something went wrong. Please try again."
      : err.message || "Server error");
  res.status(status).json({ message, issues: err.issues });
});

// node-cron only fires inside a process that stays alive. On Vercel each request runs
// in a serverless function that is frozen straight after responding, so these jobs
// never ran there. They are registered for long-running hosts only; on Vercel the
// same work is driven by Vercel Cron hitting /api/cron/daily.
if (require.main === module) {
  const { registerDailyAlerts } = require("./jobs/daily-alerts.job");
  registerDailyAlerts();
  app.listen(port, () => {
    console.log(`OptiBrandz CRM API running on http://localhost:${port}`);
  });
}

module.exports = app;
