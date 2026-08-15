const express = require("express");
const prisma = require("../db/prisma");
const asyncRoute = require("../utils/asyncRoute");
const { streamReportPdf } = require("../utils/reportPdf");
const { buildReportStats } = require("../utils/reportStats");

const router = express.Router();

// Unauthenticated on purpose, exactly like the invoice PDF: this is the link sent to a
// client so they can read their own monthly report without a CRM login. The id is a
// random UUID, so it is not guessable, and the route is read-only and noindex.
//
// The signed-in route behind /api/reports could not serve this: a browser opening a link
// in a new tab sends no Authorization header, so the report button returned 401.
router.get("/:id/pdf", asyncRoute(async (req, res) => {
  const report = await prisma.report.findUnique({
    where: { id: req.params.id },
    include: { client: true }
  });
  if (!report) return res.status(404).json({ message: "Report not found" });
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  await streamReportPdf(report, await buildReportStats(report), res);
}));

module.exports = router;
