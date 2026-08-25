/**
 * Turns Prisma's error codes into the HTTP status and wording the CRM can actually show.
 *
 * Anything that reached Prisma and threw used to come back as a 500 with
 * "Something went wrong. Please try again." — true but useless, and wrong: a bad client
 * id or a duplicate email is the caller's mistake, not a server fault. Validation now
 * catches most of these first; this is the backstop for the rest.
 *
 * https://www.prisma.io/docs/orm/reference/error-reference
 */
const MESSAGES = {
  P2000: [422, "One of those values is too long for the field."],
  P2002: [409, "That already exists."],
  P2003: [422, "That referenced record does not exist."],
  P2011: [422, "A required field was left empty."],
  P2014: [422, "That change would break a link to another record."],
  P2025: [404, "Record not found."]
};

function mapPrismaError(error) {
  if (!error || typeof error.code !== "string" || !error.code.startsWith("P2")) return null;
  const [status, message] = MESSAGES[error.code] || [422, "That value is not valid for this field."];

  // P2002 carries the offending column, which makes a far more useful message.
  if (error.code === "P2002") {
    const fields = error.meta?.target;
    const field = Array.isArray(fields) ? fields.join(", ") : fields;
    return { status, message: field ? `That ${field} is already in use.` : message };
  }
  return { status, message };
}

module.exports = { mapPrismaError };
