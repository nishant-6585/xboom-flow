import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getRepairStageBadgeClass,
  getRepairStageLabel,
  type RepairStage,
} from "@/hooks/useRepairs";

interface Props {
  stage: RepairStage | string | null | undefined;
  className?: string;
}

/**
 * Compact, themed badge for a repair stage. Pure presentation.
 */
export function RepairStageBadge({ stage, className }: Props) {
  return (
    <Badge
      variant="outline"
      className={cn("border", getRepairStageBadgeClass(stage), className)}
    >
      {getRepairStageLabel(stage)}
    </Badge>
  );
}