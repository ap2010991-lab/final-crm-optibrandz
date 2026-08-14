import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money, pretty } from "../lib/format";

/**
 * Recharts is by far the heaviest dependency in the app. Keeping every chart in this one
 * lazily-loaded module means the dashboard's KPI numbers paint straight away and the
 * charts arrive a moment later, which matters a lot on mobile data.
 */
const chartColors = ["#ff7a18", "#17836f", "#ffd84d", "#6d5dfc", "#ef4444", "#0ea5e9"];

function Panel({ title, note, children }) {
  return <div className="panel min-w-0">
    <div className="flex items-center justify-between gap-2">
      <h2 className="section-title">{title}</h2>
      {note && <span className="text-xs font-black text-zinc-400">{note}</span>}
    </div>
    <div className="mt-2">{children}</div>
  </div>;
}

function ChartEmpty({ message }) {
  return <div className="grid h-[200px] place-items-center px-4 text-center text-sm font-semibold text-zinc-500">{message}</div>;
}

export default function DashboardCharts({ d }) {
  const hasRevenue = (d.revenueChart || []).some((row) => row.invoiced || row.collected);

  return <>
    <div className="grid gap-4 xl:grid-cols-[1.35fr_.95fr]">
      <Panel title="Revenue trend" note="Invoiced vs collected">
        {hasRevenue ? <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={d.revenueChart || []} margin={{ left: -18, right: 6, top: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d6" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={62} tickFormatter={(value) => `₹${Math.round(value / 1000)}k`} />
            <Tooltip formatter={(value) => money(value)} />
            <Area dataKey="invoiced" name="Invoiced" stroke="#ff7a18" fill="#ffe0c2" isAnimationActive={false} />
            <Area dataKey="collected" name="Collected" stroke="#17836f" fill="#d7f3eb" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer> : <ChartEmpty message="No invoices raised in the last six months. Create an invoice and this chart fills in." />}
      </Panel>

      <Panel title="Lead funnel">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={d.leadFunnel || []} margin={{ left: -24, right: 6, top: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d6" />
            <XAxis dataKey="status" tick={{ fontSize: 10 }} tickFormatter={(value) => pretty(value).split(" ")[0]} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={34} />
            <Tooltip labelFormatter={pretty} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="#ff7a18" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>

    <div className="grid gap-4 xl:grid-cols-3">
      <Panel title="Service mix">
        {(d.activeClientsByService || []).length ? <>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={d.activeClientsByService} dataKey="count" nameKey="service" innerRadius={48} outerRadius={78} paddingAngle={3}>
                {d.activeClientsByService.map((entry, index) => <Cell key={entry.service} fill={chartColors[index % chartColors.length]} />)}
              </Pie>
              <Tooltip formatter={(value, name) => [value, pretty(name)]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="dashboard-legend">
            {d.activeClientsByService.map((item, index) => <span key={item.service}>
              <i style={{ background: chartColors[index % chartColors.length] }} />{pretty(item.service)}: {item.count}
            </span>)}
          </div>
        </> : <ChartEmpty message="No active services yet." />}
      </Panel>

      <Panel title="Invoice status">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={d.invoiceStatusChart || []} margin={{ left: -24, right: 6, top: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d6" />
            <XAxis dataKey="status" tick={{ fontSize: 10 }} tickFormatter={pretty} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={34} />
            <Tooltip labelFormatter={pretty} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="#17836f" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Team load">
        {(d.teamLoad || []).length ? <ResponsiveContainer width="100%" height={220}>
          <BarChart data={d.teamLoad} margin={{ left: -24, right: 6, top: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d6" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={34} />
            <Tooltip />
            <Bar dataKey="total" name="Tasks" radius={[6, 6, 0, 0]} fill="#ff7a18" isAnimationActive={false} />
            <Bar dataKey="overdue" name="Overdue" radius={[6, 6, 0, 0]} fill="#ef4444" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer> : <ChartEmpty message="No team members with tasks yet." />}
      </Panel>
    </div>
  </>;
}
