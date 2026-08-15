const express = require("express");
const prisma = require("../db/prisma");
const asyncRoute = require("../utils/asyncRoute");

const router = express.Router();

// Serves creatives held in the database. Unauthenticated on purpose, exactly like the
// invoice and report PDFs: the same link is pasted into WhatsApp so a client can see the
// post without a CRM login. The id is a random UUID, so it is not guessable.
router.get("/:id", asyncRoute(async (req, res) => {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: req.params.id },
    select: { mimeType: true, bytes: true, byteSize: true }
  });
  if (!asset) return res.status(404).json({ message: "Image not found" });

  res.setHeader("Content-Type", asset.mimeType);
  res.setHeader("Content-Length", asset.byteSize);
  // The bytes for a given id never change, so this can be cached hard.
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Content-Disposition", "inline");
  res.end(Buffer.from(asset.bytes));
}));

module.exports = router;
