import { money, pretty, prettyEnum, shortDate } from "../lib/format";
import Badge from "./Badge";

function valueAt(row, key) {
  return key.split(".").reduce((acc, part) => acc?.[part], row);
}

function renderCell(column, row) {
  const key = typeof column === "string" ? column : column.key;
  const raw = valueAt(row, key);
  if (typeof column === "object" && column.render) return column.render(row);
  const lower = key.toLowerCase();
  if (lower.includes("amount") || lower.includes("value") || lower.includes("spend") || lower === "cpl") return money(raw);
  if (lower.includes("date") || lower.endsWith("at")) return shortDate(raw);
  if (["status", "priority"].includes(key)) return <Badge tone={raw}>{pretty(raw)}</Badge>;
  if (raw === null || raw === undefined || raw === "") return "-";
  if (typeof raw === "number") return raw.toLocaleString("en-IN");
  return prettyEnum(raw);
}

function headerOf(column) {
  if (typeof column === "object") return column.label ?? pretty(column.key.split(".").at(-1));
  return pretty(column.split(".").at(-1));
}

/**
 * Renders a scrollable table on a wide screen and a stacked card list on a phone. The
 * old version forced a 720px-wide table, so on an iPhone every screen with a table
 * needed sideways scrolling to read a single row.
 */
export default function DataTable({ rows = [], columns = [], action, emptyMessage = "Nothing here yet.", title }) {
  const keys = columns.map((column) => (typeof column === "string" ? column : column.key));

  if (!rows.length) {
    return <p className="mt-4 rounded-xl border border-dashed border-[#e5e0d6] p-5 text-center text-sm font-bold text-zinc-500">{emptyMessage}</p>;
  }

  return <>
    <div className="mt-4 hidden overflow-x-auto md:block">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase text-slate-400">
            {columns.map((column, index) => <th className="px-3 py-3 font-semibold" key={keys[index]}>{headerOf(column)}</th>)}
            {action && <th className="px-3 py-3">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => <tr key={row.id || rowIndex} className="border-b border-slate-100">
            {columns.map((column, index) => <td className="px-3 py-3" key={keys[index]}>{renderCell(column, row)}</td>)}
            {action && <td className="px-3 py-3">{action(row)}</td>}
          </tr>)}
        </tbody>
      </table>
    </div>

    <div className="mt-4 space-y-3 md:hidden">
      {rows.map((row, rowIndex) => <div key={row.id || rowIndex} className="record-card">
        {title && <div className="record-card-title">{title(row)}</div>}
        <dl>
          {columns.map((column, index) => <div key={keys[index]} className="record-row">
            <dt>{headerOf(column)}</dt>
            <dd>{renderCell(column, row)}</dd>
          </div>)}
        </dl>
        {action && <div className="record-card-actions">{action(row)}</div>}
      </div>)}
    </div>
  </>;
}
