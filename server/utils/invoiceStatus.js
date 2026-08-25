const round = (value) => Math.round(Number(value || 0) * 100) / 100;

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * The one definition of what an invoice's status is.
 *
 * There used to be three, and they disagreed. The write path called a part-paid invoice
 * PARTIAL, the nightly job called the same invoice OVERDUE, and the dashboard derived
 * OVERDUE on read — so recording a part payment on a late invoice quietly removed it
 * from the overdue list and it stopped being chased.
 *
 * Being late and being part-paid are not alternatives. Anything not settled by its due
 * date is OVERDUE; `paidAmount` still records what came in, so nothing is lost and
 * "partly paid but late" is `status === "OVERDUE" && paidAmount > 0`.
 *
 * An explicit CANCELLED always wins.
 */
function invoiceStatus({ totalAmount, paidAmount, dueDate, status }, today = startOfToday()) {
  if (status === "CANCELLED") return "CANCELLED";

  const total = round(totalAmount);
  const paid = round(paidAmount);
  if (total > 0 && paid >= total) return "PAID";

  const late = dueDate && new Date(dueDate) < today;
  if (late) return "OVERDUE";
  return paid > 0 ? "PARTIAL" : "PENDING";
}

/** True when money is still owed, whatever the label says. */
const isOutstanding = (invoice) => !["PAID", "CANCELLED"].includes(invoiceStatus(invoice));

const balanceOf = (invoice) => Math.max(round(invoice.totalAmount) - round(invoice.paidAmount), 0);

module.exports = { invoiceStatus, isOutstanding, balanceOf, round, startOfToday };
