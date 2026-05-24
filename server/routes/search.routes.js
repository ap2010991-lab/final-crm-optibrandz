const express = require("express");
const { clients, leads, invoices } = require("../data");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();
router.use(verifyToken);

router.get("/", (req, res) => {
  const q = String(req.query.q || "").toLowerCase();
  const can = (permission) => req.user.role === "OWNER" || (req.user.permissions || []).includes(permission);
  res.json({ data: {
    clients: can("clients") ? clients.filter((item) => item.businessName.toLowerCase().includes(q)).slice(0, 5) : [],
    leads: can("leads") ? leads.filter((item) => `${item.name} ${item.phone}`.toLowerCase().includes(q)).slice(0, 5) : [],
    invoices: can("invoices") ? invoices.filter((item) => item.invoiceNumber.toLowerCase().includes(q)).slice(0, 5) : []
  } });
});

module.exports = router;
