/**
 * Which posts actually went out for a client in a given month.
 *
 * `publishedAt` is now stamped when a post is marked posted, so a reel that slipped from
 * the 30th to the 2nd is reported in the month it really went out. Rows created before
 * that stamp existed have no `publishedAt`, so they fall back to the date they were
 * scheduled for — the best evidence available for them.
 *
 * Shared by the signed-in report route and the public share link, so the agency and the
 * client can never be looking at two different numbers.
 */
function publishedInMonth(clientId, month, year) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return {
    clientId,
    status: "PUBLISHED",
    OR: [
      { publishedAt: { gte: start, lt: end } },
      { publishedAt: null, scheduledDate: { gte: start, lt: end } }
    ]
  };
}

module.exports = { publishedInMonth };
