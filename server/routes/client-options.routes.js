const express = require("express");
const prisma = require("../db/prisma");
const requireRole = require("../middleware/requireRole");
const asyncRoute = require("../utils/asyncRoute");

const router = express.Router();

/**
 * The client list a picker needs, and nothing more.
 *
 * The content plan is shared with the whole agency, but `clients` is not: that record
 * carries contract value, advance paid, GST number and health score, which a designer has
 * no business reading. Without this the Content page was unusable for anyone holding
 * `content` but not `clients` — which is every designer the CRM has ever invited: the
 * picker came back 403, so no client was ever selected and the page sat on its spinner.
 *
 * Only the four fields the picker and the WhatsApp handover actually use. Ordered by
 * createdAt to match /clients, so the default selection does not change per screen.
 */
router.get("/", requireRole(["OWNER", "ACCOUNT_MANAGER", "DESIGNER", "SEO_EXEC"]), asyncRoute(async (_req, res) => {
  const data = await prisma.client.findMany({
    select: { id: true, businessName: true, contactPerson: true, phone: true },
    orderBy: { createdAt: "desc" }
  });
  res.json({ data });
}));

module.exports = router;
