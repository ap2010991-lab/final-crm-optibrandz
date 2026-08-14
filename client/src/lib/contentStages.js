/**
 * The content pipeline, as this agency actually works.
 *
 * The database enum still carries REVIEW and REJECTED from the original build, but client
 * approval here happens verbally on a call, so those two stages never had a real meaning
 * and every one of the 26 posts sat in DRAFT. These four are the ones that describe real
 * steps, and they are existing enum values — no migration needed.
 */
export const CONTENT_STAGES = [
  { value: "DRAFT", label: "Draft", short: "Draft", next: "IN_DESIGN", action: "Start design" },
  { value: "IN_DESIGN", label: "Designing", short: "Design", next: "APPROVED", action: "Mark approved" },
  { value: "APPROVED", label: "Approved", short: "Approved", next: "PUBLISHED", action: "Mark posted" },
  { value: "PUBLISHED", label: "Posted", short: "Posted", next: null, action: null }
];

export const stageOf = (status) =>
  CONTENT_STAGES.find((stage) => stage.value === status) || CONTENT_STAGES[0];

export const stageIndex = (status) =>
  Math.max(CONTENT_STAGES.findIndex((stage) => stage.value === status), 0);

// Legacy values map onto the nearest live stage so old records still render sensibly.
export const normalizeStage = (status) => {
  if (status === "REVIEW") return "IN_DESIGN";
  if (status === "REJECTED") return "DRAFT";
  return CONTENT_STAGES.some((stage) => stage.value === status) ? status : "DRAFT";
};
