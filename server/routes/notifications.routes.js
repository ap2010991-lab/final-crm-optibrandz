const express = require("express");
const { notifications } = require("../data");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();
router.use(verifyToken);

router.get("/", (req, res) => {
  res.json({ data: notifications.filter((item) => item.userId === req.user.id).slice(0, 30) });
});

router.put("/read-all", (req, res) => {
  notifications.filter((item) => item.userId === req.user.id).forEach((item) => { item.isRead = true; });
  res.json({ ok: true });
});

module.exports = router;
