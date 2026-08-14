const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");
const {
  users,
  clients,
  leads,
  serviceOrders,
  tasks,
  invoices,
  campaigns,
  calendarItems,
  activities,
  notifications
} = require("../data");

const prisma = new PrismaClient();

const dateFields = new Set([
  "createdAt",
  "updatedAt",
  "onboardedAt",
  "renewalDate",
  "startDate",
  "endDate",
  "dueDate",
  "completedAt",
  "followUpDate",
  "convertedAt",
  "scheduledDate",
  "approvedAt",
  "publishedAt",
  "paidAt",
  "sentAt"
]);

function normalize(record, omit = []) {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key, value]) => !omit.includes(key) && value !== undefined)
      .map(([key, value]) => [key, dateFields.has(key) && value ? new Date(value) : value])
  );
}

async function main() {
  // This wipes every table, so it must never be pointed at the live database by accident.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DESTRUCTIVE_SEED !== "yes") {
    throw new Error("Refusing to seed a production database. Set ALLOW_DESTRUCTIVE_SEED=yes if you really mean it.");
  }
  const existingUsers = await prisma.user.count();
  if (existingUsers > 0 && process.env.ALLOW_DESTRUCTIVE_SEED !== "yes") {
    throw new Error(`Database already has ${existingUsers} user(s). Seeding would delete them. Set ALLOW_DESTRUCTIVE_SEED=yes to override.`);
  }

  await prisma.notification.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.report.deleteMany();
  await prisma.campaignLog.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.contentCalendar.deleteMany();
  await prisma.task.deleteMany();
  await prisma.serviceOrder.deleteMany();
  await prisma.client.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.user.deleteMany();
  await prisma.settings.deleteMany();

  const seedPassword = crypto.randomBytes(9).toString("base64url");
  const seedHash = await bcrypt.hash(seedPassword, 12);
  await prisma.user.createMany({ data: users.map((user) => ({ ...normalize(user), password: seedHash })) });
  await prisma.lead.createMany({ data: leads.map((lead) => normalize(lead)) });

  for (const client of clients) {
    await prisma.client.create({ data: normalize(client, ["services"]) });
  }

  await prisma.serviceOrder.createMany({ data: serviceOrders.map((order) => normalize(order)) });
  await prisma.task.createMany({ data: tasks.map((task) => normalize(task)) });
  await prisma.invoice.createMany({
    data: invoices.map((invoice) => normalize({ ...invoice, clientPhone: invoice.clientPhone || undefined }))
  });
  await prisma.campaignLog.createMany({ data: campaigns.map((campaign) => normalize(campaign)) });
  await prisma.contentCalendar.createMany({ data: calendarItems.map((item) => normalize(item)) });
  await prisma.activity.createMany({ data: activities.map((activity) => normalize(activity)) });
  await prisma.notification.createMany({ data: notifications.map((notification) => normalize(notification)) });
  await prisma.settings.create({
    data: {
      agencyName: "OptiBrandz",
      logoUrl: "/assets/optibrandz-logo.png",
      address: "Vapi, Gujarat",
      bankDetails: {
        accountName: "OptiBrandz Marketing Agency",
        website: "https://www.optibrandz.in"
      }
    }
  });

  console.log(`Seeded ${users.length} users, ${clients.length} clients, and ${leads.length} leads.`);
  console.log(`\nSign in with ${users[0].email} and this one-off password:\n\n    ${seedPassword}\n\nChange it from Settings once you are in. It is not stored anywhere else.\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
