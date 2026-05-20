const express = require("express");
const { clients, leads, invoices } = require("../data");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();
router.use(verifyToken);

router.get("/", (req, res) => {
  const q = String(req.query.q || "").toLowerCase();
  res.json({ data: {
    clients: clients.filter((item) => item.businessName.toLowerCase().includes(q)).slice(0, 5),
    leads: leads.filter((item) => `${item.name} ${item.phone}`.toLowerCase().includes(q)).slice(0, 5),
    invoices: invoices.filter((item) => item.invoiceNumber.toLowerCase().includes(q)).slice(0, 5)
  } });
});

module.exports = router;
