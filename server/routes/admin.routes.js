const express = require("express");
const verifyToken = require("../middleware/verifyToken");
const requireRole = require("../middleware/requireRole");
const data = require("../data");

const router = express.Router();
router.use(verifyToken, requireRole(["OWNER"]));

const editableCollections = ["clients", "leads", "serviceOrders", "tasks", "invoices", "campaigns", "calendarItems", "activities", "notifications"];

function safeData() {
  return {
    demoMode: true,
    collections: Object.fromEntries(editableCollections.map((key) => [key, data[key]]))
  };
}

function replaceCollection(key, value) {
  if (!Array.isArray(value)) return;
  data[key].splice(0, data[key].length, ...value);
}

router.get("/data", (_req, res) => {
  res.json({ data: safeData() });
});

router.put("/data/:collection", (req, res) => {
  const { collection } = req.params;
  if (!editableCollections.includes(collection)) return res.status(404).json({ message: "Collection not found" });
  if (!Array.isArray(req.body.records)) return res.status(422).json({ message: "records must be an array" });
  replaceCollection(collection, req.body.records);
  res.json({ data: { collection, records: data[collection] } });
});

router.put("/data", (req, res) => {
  const collections = req.body.collections || {};
  editableCollections.forEach((key) => replaceCollection(key, collections[key]));
  res.json({ data: safeData() });
});

module.exports = router;
