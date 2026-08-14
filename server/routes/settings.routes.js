const express = require("express");
const { z } = require("zod");
const asyncRoute = require("../utils/asyncRoute");
const requireRole = require("../middleware/requireRole");
const { getAgencySettings, saveAgencySettings } = require("../utils/agencySettings");

const router = express.Router();

const optionalText = z.string().max(400).optional().nullable();
const settingsSchema = z.object({
  agencyName: z.string().min(1).max(200).optional(),
  address: optionalText,
  phone: optionalText,
  whatsapp: optionalText,
  email: optionalText,
  website: optionalText,
  gstNumber: optionalText,
  invoiceNotes: optionalText,
  logoUrl: optionalText
});

// Every signed-in user may read the agency profile: it is shown on invoices and in
// WhatsApp message templates. Only the owner may change it.
router.get("/", asyncRoute(async (_req, res) => {
  res.json({ data: await getAgencySettings() });
}));

router.put("/", requireRole(["OWNER"]), asyncRoute(async (req, res) => {
  const body = settingsSchema.parse(req.body);
  await saveAgencySettings(body);
  res.json({ data: await getAgencySettings() });
}));

module.exports = router;
