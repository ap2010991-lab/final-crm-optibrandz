const express = require("express");
const asyncRoute = require("../utils/asyncRoute");
const { runDailyAlerts } = require("../jobs/daily-alerts.job");
const { runRenewalAlerts } = require("../jobs/renewal-alerts.job");

const router = express.Router();

// Vercel Cron calls these with `Authorization: Bearer $CRON_SECRET`.
function authorizeCron(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ message: "CRON_SECRET is not configured" });
  // Header only: a secret passed as ?key= ends up in access logs, browser history and
  // any referrer sent onward, none of which can be un-leaked.
  const header = req.headers.authorization || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!provided || provided !== secret) return res.status(401).json({ message: "Invalid cron secret" });
  next();
}

router.get("/daily", authorizeCron, asyncRoute(async (_req, res) => {
  res.json({ ok: true, ...(await runDailyAlerts()) });
}));

router.get("/renewals", authorizeCron, asyncRoute(async (_req, res) => {
  res.json({ ok: true, ...(await runRenewalAlerts()) });
}));

module.exports = router;
