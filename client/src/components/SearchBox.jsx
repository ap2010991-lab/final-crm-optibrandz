import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Search, X } from "lucide-react";
import { api } from "../lib/api";
import { money } from "../lib/format";

export default function SearchBox({ onClose }) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const navigate = useNavigate();

  // Every keystroke used to fire its own request. Waiting 250ms means typing a client
  // name sends one query instead of a dozen — noticeably better on mobile data.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(timer);
  }, [term]);

  const enabled = debounced.length >= 2;
  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api(`/search?q=${encodeURIComponent(debounced)}`),
    enabled
  });

  const groups = [
    ["Clients", data?.data?.clients || [], (item) => `/clients/${item.id}`, (item) => item.businessName],
    ["Leads", data?.data?.leads || [], (item) => `/leads/${item.id}`, (item) => `${item.name} · ${item.phone}`],
    ["Invoices", data?.data?.invoices || [], () => "/invoices", (item) => `${item.invoiceNumber} · ${money(item.totalAmount)}`]
  ];
  const hasResults = groups.some(([, rows]) => rows.length);

  function go(path) {
    setTerm("");
    navigate(path);
    onClose?.();
  }

  return <div className="relative w-full">
    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
    <input
      className="search-input"
      type="search"
      autoComplete="off"
      placeholder="Search clients, leads, invoices"
      value={term}
      onChange={(event) => setTerm(event.target.value)}
    />
    {term && <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-zinc-400"
      onClick={() => setTerm("")} aria-label="Clear search"><X size={16} /></button>}

    {enabled && <div className="search-popover">
      {isFetching && <div className="search-empty">Searching...</div>}
      {!isFetching && !hasResults && <div className="search-empty">No matching records.</div>}
      {!isFetching && groups.map(([label, rows, href, title]) => rows.length > 0 && <div key={label} className="py-2">
        <div className="px-3 pb-1 text-[11px] font-black uppercase tracking-wide text-zinc-400">{label}</div>
        {rows.map((item) => <button
          key={item.id}
          type="button"
          className="search-result"
          onMouseDown={(event) => { event.preventDefault(); go(href(item)); }}
        >
          <span className="truncate">{title(item)}</span>
          <ChevronRight size={15} className="shrink-0" />
        </button>)}
      </div>)}
    </div>}
  </div>;
}
