import { Card, CardContent } from "@/components/ui/card";
import {
  Repair,
  REPAIR_STAGES,
  getRepairStageBadgeClass,
  getRepairStageLabel,
} from "@/hooks/useRepairs";

interface Props {
  repairs: Repair[];
  onStageClick?: (stage: string) => void;
  activeStage?: string;
}

/**
 * Horizontal stage-count strip for the Repairs page. Clicking a chip filters
 * the list (handler passed from parent). Closed stages are visually muted.
 */
export function RepairStageDistribution({
  repairs,
  onStageClick,
  activeStage,
}: Props) {
  const counts = new Map<string, number>();
  for (const r of repairs) {
    counts.set(r.repair_stage, (counts.get(r.repair_stage) ?? 0) + 1);
  }

  return (
    <Card>
      <CardContent className="p-3 flex flex-wrap gap-2">
        {REPAIR_STAGES.map((s) => {
          const count = counts.get(s.value) ?? 0;
          const isActive = activeStage === s.value;
          const isClosed = s.category === "closed";
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onStageClick?.(s.value)}
              className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors flex items-center gap-2
                ${getRepairStageBadgeClass(s.value)}
                ${isActive ? "ring-2 ring-primary" : ""}
                ${isClosed && count === 0 ? "opacity-50" : ""}
                hover:opacity-90`}
            >
              <span>{getRepairStageLabel(s.value)}</span>
              <span className="font-bold tabular-nums">{count}</span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}