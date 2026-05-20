const express = require("express");
const { campaigns } = require("../data");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();
router.use(verifyToken);

router.get("/", (req, res) => {
  const data = campaigns.filter((item) =>
    (!req.query.clientId || item.clientId === req.query.clientId) &&
    (!req.query.month || item.month === Number(req.query.month)) &&
    (!req.query.year || item.year === Number(req.query.year))
  );
  res.json({ data });
});

router.post("/", (req, res) => {
  const item = { id: `g-${Date.now()}`, ...req.body };
  campaigns.unshift(item);
  res.status(201).json({ data: item });
});

router.put("/:id", (req, res) => {
  const item = campaigns.find((entry) => entry.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Campaign log not found" });
  Object.assign(item, req.body);
  res.json({ data: item });
});

module.exports = router;
