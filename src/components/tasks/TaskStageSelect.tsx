import { TaskStage, TASK_STAGES } from "@/hooks/useTasks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface TaskStageSelectProps {
  value: TaskStage;
  onChange: (stage: TaskStage) => void;
  disabled?: boolean;
}

export function TaskStageSelect({ value, onChange, disabled }: TaskStageSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as TaskStage)}
      disabled={disabled}
    >
      <SelectTrigger className="w-[140px] h-8">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TASK_STAGES.map((stage) => (
          <SelectItem key={stage.value} value={stage.value}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${stage.color}`} />
              {stage.label}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TaskStageBadge({ stage }: { stage: TaskStage }) {
  const stageConfig = TASK_STAGES.find((s) => s.value === stage);
  return (
    <Badge
      variant="outline"
      className={`${stageConfig?.color} text-white border-0`}
    >
      {stageConfig?.label}
    </Badge>
  );
}
