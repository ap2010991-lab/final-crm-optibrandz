/**
 * Keeps only the fields the caller actually sent.
 *
 * Zod applies `.default()` values for absent keys even after `.partial()`, so a PATCH-style
 * `PUT { status }` against a schema with defaults silently rewrote every other defaulted
 * field. In practice that meant advancing a post's stage reset a LinkedIn Carousel to an
 * Instagram Static, dragging a lead across the kanban reset its source to Website and
 * wiped its serviceInterest array, and editing an invoice zeroed its GST and paid amounts.
 *
 * Parse for validation, then run the result through this so an update only ever touches
 * the fields that were genuinely supplied.
 *
 * @param {object} raw     req.body as received
 * @param {object} parsed  the Zod-validated object
 */
function onlyProvided(raw, parsed) {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(parsed).filter(([key]) => Object.prototype.hasOwnProperty.call(raw, key))
  );
}

module.exports = { onlyProvided };
