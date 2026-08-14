const prisma = require("../db/prisma");

const defaults = {
  agencyName: "OptiBrandz Marketing Agency",
  address: "Vapi, Gujarat, India",
  phone: "",
  whatsapp: "",
  email: "grow@optibrandz.in",
  website: "https://www.optibrandz.in",
  gstNumber: "",
  invoiceNotes: "",
  bankDetails: null
};

// Agency profile used to be kept in each browser's localStorage, so it never reached
// the invoice PDF and did not follow the owner to their phone. It now lives in the
// database as a single row.
async function getAgencySettings() {
  const row = await prisma.settings.findFirst({ orderBy: { createdAt: "asc" } });
  if (!row) return { ...defaults };
  return {
    ...defaults,
    ...Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null && value !== undefined))
  };
}

async function saveAgencySettings(patch) {
  const existing = await prisma.settings.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return prisma.settings.update({ where: { id: existing.id }, data: patch });
  return prisma.settings.create({ data: { ...defaults, ...patch } });
}

module.exports = { getAgencySettings, saveAgencySettings, agencyDefaults: defaults };
