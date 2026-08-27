import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import { monthLabel, pretty } from "../lib/format";
import { normalizeStage, stageOf } from "../lib/contentStages";
import { QueryState } from "../components/QueryState";
import PostCard from "../components/PostCard";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * What is going out, and when, across every client.
 *
 * The Content page plans one client's month. This answers the different question the
 * owner actually asks — "what is approved and due to post today?" — so it spans all
 * clients and defaults to the approved-only view.
 */
export default function Schedule() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [clientId, setClientId] = useState("");
  const [approvedOnly, setApprovedOnly] = useState(true);
  const [selectedDay, setSelectedDay] = useState(isThisMonth(month, year) ? today.getDate() : null);

  // Not /clients: the content plan is shared with colleagues who have no business
  // reading contract values, so this asks only for the names it puts in the picker.
  const clientsQuery = useQuery({ queryKey: ["client-options"], queryFn: () => api("/client-options") });
  const clients = clientsQuery.data?.data || [];

  const query = useQuery({
    queryKey: ["schedule", month, year, clientId],
    queryFn: () => api(`/calendar?month=${month}&year=${year}${clientId ? `&clientId=${encodeURIComponent(clientId)}` : ""}`)
  });

  const items = useMemo(() => {
    const all = query.data?.data || [];
    return approvedOnly ? all.filter((item) => normalizeStage(item.status) === "APPROVED") : all;
  }, [query.data, approvedOnly]);

  const byDay = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      if (!item.scheduledDate) return;
      const date = new Date(item.scheduledDate);
      if (date.getMonth() !== month - 1 || date.getFullYear() !== year) return;
      const day = date.getDate();
      map.set(day, [...(map.get(day) || []), item]);
    });
    return map;
  }, [items, month, year]);

  const grid = useMemo(() => buildMonthGrid(month, year), [month, year]);
  const undated = items.filter((item) => !item.scheduledDate);
  const daysPosting = byDay.size;

  function changeMonth(delta) {
    const next = new Date(year, month - 1 + delta, 1);
    setMonth(next.getMonth() + 1);
    setYear(next.getFullYear());
    setSelectedDay(null);
  }

  const selectedItems = selectedDay ? byDay.get(selectedDay) || [] : [];
  const isToday = (day) => isThisMonth(month, year) && day === today.getDate();

  return <div className="space-y-4">
    <div className="toolbar">
      <div className="flex flex-wrap items-center gap-2">
        <button className="icon-button" onClick={() => changeMonth(-1)} aria-label="Previous month"><ChevronLeft size={17} /></button>
        <span className="month-pill">{monthLabel(month, year)}</span>
        <button className="icon-button" onClick={() => changeMonth(1)} aria-label="Next month"><ChevronRight size={17} /></button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input max-w-[190px]" value={clientId} onChange={(event) => setClientId(event.target.value)}>
          <option value="">All clients</option>
          {clients.map((client) => <option key={client.id} value={client.id}>{client.businessName}</option>)}
        </select>
        <button
          type="button"
          className={approvedOnly ? "primary" : "secondary-button"}
          onClick={() => setApprovedOnly((value) => !value)}
          aria-pressed={approvedOnly}
        >
          <CalendarCheck size={16} /> {approvedOnly ? "Approved only" : "All posts"}
        </button>
      </div>
    </div>

    <QueryState query={query} label="schedule">
      <>
        <div className="panel">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="section-title">{monthLabel(month, year)}</h2>
            <span className="text-xs font-bold text-zinc-500">
              {items.length} {approvedOnly ? "approved" : "planned"} · {daysPosting} posting day{daysPosting === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-black uppercase text-zinc-400">
            {WEEKDAYS.map((day) => <div key={day}>{day}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-2">
            {grid.map((day, index) => {
              if (!day) return <div key={`pad-${index}`} className="schedule-day empty" />;
              const dayItems = byDay.get(day) || [];
              const selected = selectedDay === day;
              return <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(selected ? null : day)}
                className={`schedule-day ${dayItems.length ? "has-posts" : ""} ${selected ? "selected" : ""} ${isToday(day) ? "is-today" : ""}`}
                aria-label={`${day} ${monthLabel(month, year)}, ${dayItems.length} post${dayItems.length === 1 ? "" : "s"}`}
              >
                <span className="schedule-day-number">{day}</span>
                {dayItems.length > 0 && <span className="schedule-day-count">{dayItems.length}</span>}
                {/* Platform initials on wider screens; the count alone is enough on a phone. */}
                <span className="schedule-day-chips">
                  {dayItems.slice(0, 2).map((item) => <i key={item.id} className={stageOf(normalizeStage(item.status)).value.toLowerCase()}>
                    {pretty(item.platform).slice(0, 2)}
                  </i>)}
                </span>
              </button>;
            })}
          </div>
        </div>

        {selectedDay && <div className="panel">
          <h2 className="section-title">
            {selectedItems.length} post{selectedItems.length === 1 ? "" : "s"} on {selectedDay} {monthLabel(month, year)}
          </h2>
          <div className="mt-3 space-y-3">
            {selectedItems.length === 0 && <p className="empty-state">Nothing scheduled for this day.</p>}
            {selectedItems.map((item) => <PostCard key={item.id} post={item} showClientName onChanged={() => query.refetch()} />)}
          </div>
        </div>}

        {!selectedDay && items.length > 0 && <p className="text-center text-sm font-semibold text-zinc-500">
          Tap a day to see what goes out.
        </p>}

        {items.length === 0 && <div className="empty-state">
          <h3>Nothing {approvedOnly ? "approved" : "planned"} for {monthLabel(month, year)}</h3>
          <p>{approvedOnly
            ? "Approve posts from the Content page and they appear here on the day they go out."
            : "Plan this month's posts from the Content page."}</p>
        </div>}

        {undated.length > 0 && <div className="panel">
          <h2 className="section-title">No date set</h2>
          <p className="mt-1 text-xs font-semibold text-zinc-500">These will not appear on the calendar until they have a date.</p>
          <div className="mt-3 space-y-3">
            {undated.map((item) => <PostCard key={item.id} post={item} showClientName onChanged={() => query.refetch()} />)}
          </div>
        </div>}
      </>
    </QueryState>
  </div>;
}

const isThisMonth = (month, year) => {
  const now = new Date();
  return now.getMonth() === month - 1 && now.getFullYear() === year;
};

// Monday-first, padded so every date sits under the correct weekday.
function buildMonthGrid(month, year) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const cells = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
