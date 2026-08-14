const tones = {
  NEW: "bg-sky-100 text-sky-700 border-sky-200",
  CONTACTED: "bg-blue-100 text-blue-700 border-blue-200",
  DEMO_SCHEDULED: "bg-violet-100 text-violet-700 border-violet-200",
  PROPOSAL_SENT: "bg-amber-100 text-amber-800 border-amber-200",
  NEGOTIATION: "bg-orange-100 text-orange-800 border-orange-200",
  CONVERTED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  LOST: "bg-rose-100 text-rose-700 border-rose-200",
  PAID: "bg-emerald-100 text-emerald-700 border-emerald-200",
  PARTIAL: "bg-blue-100 text-blue-700 border-blue-200",
  OVERDUE: "bg-rose-100 text-rose-700 border-rose-200",
  CANCELLED: "bg-zinc-200 text-zinc-600 border-zinc-300",
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  IN_PROGRESS: "bg-blue-100 text-blue-700 border-blue-200",
  REVIEW: "bg-violet-100 text-violet-700 border-violet-200",
  DONE: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ACTIVE: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ONBOARDING: "bg-blue-100 text-blue-700 border-blue-200",
  PAUSED: "bg-amber-100 text-amber-800 border-amber-200",
  CHURNED: "bg-rose-100 text-rose-700 border-rose-200",
  DRAFT: "bg-zinc-100 text-zinc-600 border-zinc-200",
  APPROVED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  PUBLISHED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  LOW: "bg-zinc-100 text-zinc-600 border-zinc-200",
  MEDIUM: "bg-blue-100 text-blue-700 border-blue-200",
  HIGH: "bg-orange-100 text-orange-800 border-orange-200",
  URGENT: "bg-rose-100 text-rose-700 border-rose-200"
};

export default function Badge({ children, tone }) {
  return <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-bold ${tones[tone] || "border-slate-200 bg-slate-100 text-slate-700"}`}>
    {children}
  </span>;
}
