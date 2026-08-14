import { CheckCircle2 } from "lucide-react";
import { normalizeStage, stageOf } from "../lib/contentStages";

const TONES = {
  DRAFT: "bg-zinc-100 text-zinc-600 border-zinc-200",
  IN_DESIGN: "bg-blue-100 text-blue-700 border-blue-200",
  APPROVED: "bg-amber-100 text-amber-800 border-amber-200",
  PUBLISHED: "bg-emerald-100 text-emerald-700 border-emerald-200"
};

export function StageChip({ status }) {
  const stage = stageOf(normalizeStage(status));
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold ${TONES[stage.value]}`}>
    {stage.value === "PUBLISHED" && <CheckCircle2 size={12} />}
    {stage.label}
  </span>;
}

export default StageChip;
