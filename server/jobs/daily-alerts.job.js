const cron = require("node-cron");
const { leads, tasks, invoices, notifications, users } = require("../data");

function createNotification(userId, type, message, link) {
  notifications.unshift({ id: `n-${Date.now()}-${Math.random()}`, userId, type, message, link, isRead: false, createdAt: new Date().toISOString() });
}

function registerDailyAlerts() {
  cron.schedule("0 9 * * *", () => {
    const owner = users.find((user) => user.role === "OWNER");
    leads.filter((lead) => lead.followUpDate && new Date(lead.followUpDate) <= new Date() && !["CONVERTED", "LOST"].includes(lead.status))
      .forEach((lead) => createNotification(lead.assignedToId || owner.id, "LEAD", `Follow up ${lead.name}`, `/leads/${lead.id}`));
    tasks.filter((task) => new Date(task.dueDate) <= new Date() && task.status !== "DONE")
      .forEach((task) => createNotification(task.assignedToId, "TASK", `Task due: ${task.title}`, "/tasks"));
    invoices.filter((invoice) => new Date(invoice.dueDate) < new Date() && invoice.status === "PENDING")
      .forEach((invoice) => {
        invoice.status = "OVERDUE";
        createNotification(owner.id, "INVOICE", `Invoice ${invoice.invoiceNumber} is overdue`, "/invoices");
      });
  });
}

module.exports = { registerDailyAlerts, createNotification };
