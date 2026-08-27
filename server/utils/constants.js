const allPermissions = ["dashboard", "ai", "leads", "clients", "services", "content", "invoices", "campaigns", "reports", "team", "settings"];
const roles = ["OWNER", "ACCOUNT_MANAGER", "SEO_EXEC", "DESIGNER", "CLIENT"];

// The content plan and its to-do list are shared by the whole agency: everyone can see
// what is going out and tick off what they have done, so `content` is part of the floor
// every staff login starts on. It stays a real permission rather than being hard-wired,
// so the owner can still take it away from an individual in the Team panel.
const defaultStaffPermissions = ["dashboard", "content"];

// Clients only ever get their portal, and never the agency's own work list.
const clientPermissions = ["portal"];

module.exports = { allPermissions, roles, defaultStaffPermissions, clientPermissions };
