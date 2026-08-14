import { Bot, BriefcaseBusiness, CalendarDays, CircleDollarSign, ClipboardList, FileText, LayoutDashboard, Megaphone, Settings, Sparkles, Sun, Users } from "lucide-react";

// `key` is the permission name checked on both the client and the server.
export const navItems = [
  { label: "Today", short: "Today", href: "/today", icon: Sun, key: "dashboard" },
  { label: "Leads", short: "Leads", href: "/leads", icon: Megaphone, key: "leads" },
  { label: "Clients", short: "Clients", href: "/clients", icon: BriefcaseBusiness, key: "clients" },
  { label: "Invoices", short: "Invoices", href: "/invoices", icon: CircleDollarSign, key: "invoices" },
  { label: "AI Agent", short: "AI", href: "/ai", icon: Bot, key: "ai" },
  { label: "Services & Tasks", short: "Tasks", href: "/services", icon: ClipboardList, key: "services" },
  { label: "Content", short: "Content", href: "/content", icon: CalendarDays, key: "content" },
  { label: "Campaigns", short: "Campaigns", href: "/campaigns", icon: Sparkles, key: "campaigns" },
  { label: "Reports", short: "Reports", href: "/reports", icon: FileText, key: "reports" },
  { label: "Team", short: "Team", href: "/team/workload", icon: Users, key: "team" },
  { label: "Dashboard", short: "Charts", href: "/dashboard", icon: LayoutDashboard, key: "dashboard" },
  { label: "Settings", short: "Settings", href: "/settings", icon: Settings, key: "settings" }
];

// The four tabs pinned to the bottom bar on a phone. Everything else lives behind
// "More" — previously the bottom bar showed the first five items and the other six
// sections were simply unreachable on a phone.
//
// Matched on href rather than permission key: Today and Dashboard deliberately share the
// "dashboard" permission, so keying on that would pin both and push Invoices out.
export const PRIMARY_MOBILE_HREFS = ["/today", "/clients", "/content", "/invoices"];

export function canAccess(user, permission) {
  if (!user) return false;
  if (user.role === "OWNER") return true;
  if (!permission) return true;
  return (user.permissions || []).includes(permission);
}

export function visibleNav(user) {
  return navItems.filter((item) => canAccess(user, item.key));
}

export function firstAllowedPath(user) {
  if (user?.role === "CLIENT") return "/portal/dashboard";
  return visibleNav(user)[0]?.href || "/login";
}

// `/team` must not match `/team/workload` twice, and `/clients` must stay highlighted
// while viewing `/clients/:id`.
export function isActivePath(pathname, href) {
  const base = href.startsWith("/team") ? "/team" : href;
  return pathname === base || pathname.startsWith(`${base}/`);
}
