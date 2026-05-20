const cron = require("node-cron");
const { clients, users, notifications } = require("../data");

function registerRenewalAlerts() {
  cron.schedule("0 9 1 * *", () => {
    const notifyUsers = users.filter((user) => ["OWNER", "ACCOUNT_MANAGER"].includes(user.role));
    clients.filter((client) => client.renewalDate && new Date(client.renewalDate) < new Date(Date.now() + 30 * 86400000))
      .forEach((client) => notifyUsers.forEach((user) => notifications.unshift({
        id: `n-${Date.now()}-${user.id}`,
        userId: user.id,
        type: "RENEWAL",
        message: `${client.businessName} renewal due soon`,
        link: `/clients/${client.id}`,
        isRead: false,
        createdAt: new Date().toISOString()
      })));
  });
}

module.exports = { registerRenewalAlerts };
