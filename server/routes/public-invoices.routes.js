const express = require("express");
const prisma = require("../db/prisma");
const asyncRoute = require("../utils/asyncRoute");
const { streamInvoicePdf } = require("../utils/invoicePdf");

const router = express.Router();

// Unauthenticated on purpose: this is the link pasted into WhatsApp so a client can
// open their own invoice without a CRM login. The id is a random UUID, so it is not
// guessable, but the route is deliberately kept read-only and noindex.
router.get("/:id/pdf", asyncRoute(async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: { client: true }
  });
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  await streamInvoicePdf(invoice, res);
}));

module.exports = router;
