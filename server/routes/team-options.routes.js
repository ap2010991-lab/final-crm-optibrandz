const express = require("express");
const prisma = require("../db/prisma");
const asyncRoute = require("../utils/asyncRoute");

const router = express.Router();

/**
 * The colleagues a note may be shared with, and nothing more.
 *
 * The same shape as /client-options and for the same reason: the picker needs names, and
 * the `User` record carries an email, a password hash, a phone number and a permission
 * list that a picker has no business reading.
 *
 * This list *is* the rule that a note can only be shared with somebody the owner added —
 * only the owner can write to `User`, through the OWNER-gated /api/team. Nobody is typed
 * in by hand anywhere, so there is no path to sharing with a stranger.
 *
 * Excluded: clients, because a client is not a colleague; removed teammates, because
 * offering somebody who can no longer sign in is offering nothing; and yourself, because
 * a note you own is already yours to read.
 */
// `?includeSelf=1` is for the task assignee picker. Task assignees used to come from
// /api/team, which is owner-only, so no colleague could ever add a task: the button sat
// disabled with no explanation. Assigning a task to yourself is the commonest case.
router.get("/", asyncRoute(async (req, res) => {
  const includeSelf = req.query.includeSelf === "1";
  const data = await prisma.user.findMany({
    where: { isActive: true, role: { not: "CLIENT" }, ...(includeSelf ? {} : { id: { not: req.user.id } }) },
    select: { id: true, name: true, avatar: true, role: true },
    orderBy: { createdAt: "asc" }
  });
  res.json({ data });
}));

module.exports = router;
