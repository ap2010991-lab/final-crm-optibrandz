const cron = require("node-cron");
const prisma = require("../db/prisma");

function registerRenewalAlerts() {
  cron.schedule("0 9 1 * *", async () => {
    const [notifyUsers, clients] = await Promise.all([
      prisma.user.findMany({ where: { role: { in: ["OWNER", "ACCOUNT_MANAGER"] }, isActive: true } }),
      prisma.client.findMany({ where: { renewalDate: { lt: new Date(Date.now() + 30 * 86400000) } } })
    ]);
    const notifications = clients.flatMap((client) => notifyUsers.map((user) => ({
      userId: user.id,
      type: "RENEWAL",
      message: `${client.businessName} renewal due soon`,
      link: `/clients/${client.id}`,
      isRead: false
    })));
    if (notifications.length) await prisma.notification.createMany({ data: notifications });
  });
}

module.exports = { registerRenewalAlerts };
