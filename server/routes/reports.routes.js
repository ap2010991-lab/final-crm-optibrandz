const express = require("express");
const { clients, campaigns } = require("../data");
const verifyToken = require("../middleware/verifyToken");

const reports = [];
const router = express.Router();
router.use(verifyToken);

router.post("/generate", (req, res) => {
  const { clientId, month, year, nextMonthPlan = "Continue optimization and report weekly progress." } = req.body;
  const client = clients.find((item) => item.id === clientId);
  const report = {
    id: `r-${Date.now()}`,
    clientId,
    month,
    year,
    summary: `This month we managed ${(client?.services || []).length} services for ${client?.businessName || "client"}. ${nextMonthPlan}`,
    pdfUrl: `/api/reports/${Date.now()}.pdf`,
    sentAt: null,
    createdAt: new Date().toISOString(),
    campaignCount: campaigns.filter((item) => item.clientId === clientId && item.month === month && item.year === year).length
  };
  reports.unshift(report);
  res.status(201).json({ data: report });
});

router.get("/", (req, res) => {
  const data = reports.filter((item) => !req.query.clientId || item.clientId === req.query.clientId);
  res.json({ data });
});

module.exports = router;
