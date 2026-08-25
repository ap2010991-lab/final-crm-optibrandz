const { Prisma } = require("@prisma/client");
const { z } = require("zod");

/**
 * Zod validators for every enum in the Prisma schema, derived from the generated client.
 *
 * These used to be declared as `z.string()` on each route, so an unknown value sailed
 * through validation, reached Postgres and came back as a 500 with no usable message —
 * confirmed on /services, /leads, /calendar, /clients and /campaigns. Reading the values
 * out of the schema instead means the two can never disagree: add a value to
 * schema.prisma and it is accepted here the moment the client is regenerated.
 */
const values = Object.fromEntries(
  Prisma.dmmf.datamodel.enums.map((entry) => [entry.name, entry.values.map((value) => value.name)])
);

function enumOf(name) {
  const options = values[name];
  if (!options) throw new Error(`Unknown Prisma enum "${name}"`);
  // The message names the field and lists what is allowed, so the CRM can show it as-is.
  return z.enum(options, {
    message: `Choose one of: ${options.join(", ")}.`
  });
}

module.exports = {
  enumValues: values,
  enumOf,
  Role: enumOf("Role"),
  LeadSource: enumOf("LeadSource"),
  LeadStatus: enumOf("LeadStatus"),
  ClientStatus: enumOf("ClientStatus"),
  ServiceType: enumOf("ServiceType"),
  ServiceStatus: enumOf("ServiceStatus"),
  TaskStatus: enumOf("TaskStatus"),
  Priority: enumOf("Priority"),
  Platform: enumOf("Platform"),
  PostType: enumOf("PostType"),
  ContentStatus: enumOf("ContentStatus"),
  ContentTaskType: enumOf("ContentTaskType"),
  InvoiceStatus: enumOf("InvoiceStatus"),
  ActivityType: enumOf("ActivityType")
};
