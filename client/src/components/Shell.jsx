import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, LogOut, MoreHorizontal, Search as SearchIcon, X } from "lucide-react";
import { api, useAuth } from "../lib/api";
import { PRIMARY_MOBILE_HREFS, isActivePath, visibleNav } from "../lib/nav";
import { initials, pretty } from "../lib/format";
import BrandLogo from "./BrandLogo";
import SearchBox from "./SearchBox";
import NotificationPanel from "./NotificationPanel";

export default function Shell({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const allowed = visibleNav(user);
  const current = allowed.find((item) => isActivePath(location.pathname, item.href));
  const title = current?.label || "OptiBrandz CRM";

  // On a phone the bar holds four fixed tabs plus More. Everything the user has access
  // to is reachable from More, so no section is hidden on mobile any more.
  const primary = PRIMARY_MOBILE_HREFS
    .map((href) => allowed.find((item) => item.href === href))
    .filter(Boolean)
    .slice(0, 4);
  const overflow = allowed.filter((item) => !primary.some((tab) => tab.href === item.href));

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api("/notifications"),
    enabled: Boolean(user),
    refetchInterval: 5 * 60 * 1000,
    retry: 1
  });
  const notificationItems = data?.data || [];
  const unread = notificationItems.length;

  // Navigating closes whatever sheet is open, otherwise tapping a link in More leaves
  // the overlay covering the page you just opened.
  function closeSheets() {
    setShowMore(false);
    setShowNotifications(false);
    setShowSearch(false);
  }

  return <div className="app-shell min-h-screen text-zinc-950">
    <aside className="brand-sidebar fixed inset-y-0 left-0 z-20 hidden w-68 border-r lg:block">
      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-5">
        <BrandLogo />
        <div>
          <div className="font-semibold text-white">Optibrandz</div>
          <div className="text-xs text-white/55">Agency growth CRM</div>
        </div>
      </div>
      <nav className="space-y-1 overflow-y-auto p-3 pb-28">
        {allowed.map(({ label, href, icon: Icon }) => <Link
          key={href}
          to={href}
          onClick={closeSheets}
          className={`sidebar-link ${isActivePath(location.pathname, href) ? "active" : ""}`}
        ><Icon size={18} />{label}</Link>)}
      </nav>
      <div className="absolute bottom-0 w-full border-t border-white/10 bg-[#090909] p-4">
        <div className="user-strip flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#ffd84d] text-sm font-black text-[#090909]">
            {user?.avatar || initials(user?.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{user?.name}</div>
            <div className="truncate text-xs text-white/55">{pretty(user?.role)}</div>
          </div>
          <button type="button" className="dark-icon-button" onClick={logout} title="Sign out"><LogOut size={16} /></button>
        </div>
      </div>
    </aside>

    <div className="lg:pl-68">
      <header className="topbar">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h1 className="truncate text-lg font-black tracking-tight">{title}</h1>
        </div>
        <div className="hidden max-w-md flex-1 lg:block"><SearchBox /></div>
        <button type="button" className="icon-button lg:hidden" onClick={() => setShowSearch((value) => !value)} aria-label="Search">
          {showSearch ? <X size={18} /> : <SearchIcon size={18} />}
        </button>
        <div className="relative">
          <button type="button" className="icon-button relative" aria-label="Notifications"
            onClick={() => setShowNotifications((value) => !value)}>
            <Bell size={18} />
            {unread > 0 && <span className="notification-count">{unread > 9 ? "9+" : unread}</span>}
          </button>
          {showNotifications && <NotificationPanel
            items={notificationItems}
            savedCount={data?.meta?.savedCount || 0}
            onClose={() => setShowNotifications(false)}
          />}
        </div>
      </header>

      {showSearch && <div className="mobile-search lg:hidden"><SearchBox onClose={() => setShowSearch(false)} /></div>}

      <main className="page-main">{children}</main>
    </div>

    <nav className="tab-bar lg:hidden">
      {primary.map(({ short, href, icon: Icon }) => <Link
        key={href}
        to={href}
        onClick={closeSheets}
        className={`tab-item ${isActivePath(location.pathname, href) ? "active" : ""}`}
      ><Icon size={20} /><span>{short}</span></Link>)}
      {overflow.length > 0 && <button
        type="button"
        className={`tab-item ${showMore ? "active" : ""}`}
        onClick={() => setShowMore((value) => !value)}
        aria-expanded={showMore}
      ><MoreHorizontal size={20} /><span>More</span></button>}
    </nav>

    {showMore && <>
      <button type="button" className="sheet-scrim" aria-label="Close menu" onClick={() => setShowMore(false)} />
      <div className="more-sheet lg:hidden">
        <div className="more-sheet-head">
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ffd84d] text-sm font-black text-[#090909]">
              {user?.avatar || initials(user?.name)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-black">{user?.name}</div>
              <div className="truncate text-xs font-semibold text-zinc-500">{pretty(user?.role)}</div>
            </div>
          </div>
          <button type="button" className="icon-button" onClick={() => setShowMore(false)} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="more-grid">
          {overflow.map(({ label, href, icon: Icon }) => <Link key={href} to={href} onClick={closeSheets} className="more-item">
            <Icon size={20} />{label}
          </Link>)}
        </div>
        <button type="button" className="danger-button w-full" onClick={logout}><LogOut size={16} /> Sign out</button>
      </div>
    </>}
  </div>;
}
