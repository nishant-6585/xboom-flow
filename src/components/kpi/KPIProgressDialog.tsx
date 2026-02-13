import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { EmployeeKPIRecord, KPIProgressRecord } from "@/hooks/useKPIManagement";
import { format } from "date-fns";

interface KPIProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kpi: EmployeeKPIRecord | null;
  progressHistory: KPIProgressRecord[];
  onUpdateProgress: (kpiId: string, achievedValue: number, notes?: string) => Promise<boolean>;
  onFetchProgress: (kpiId: string) => void;
  readOnly?: boolean;
}

export function KPIProgressDialog({
  open,
  onOpenChange,
  kpi,
  progressHistory,
  onUpdateProgress,
  onFetchProgress,
  readOnly = false,
}: KPIProgressDialogProps) {
  const [achievedValue, setAchievedValue] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (kpi && open) {
      setAchievedValue(kpi.achieved_value || 0);
      setNotes("");
      onFetchProgress(kpi.id);
    }
  }, [kpi, open]);

  if (!kpi) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    const success = await onUpdateProgress(kpi.id, achievedValue, notes || undefined);
    setSubmitting(false);
    if (success) {
      setNotes("");
      onFetchProgress(kpi.id);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "green": return "bg-green-500";
      case "amber": return "bg-yellow-500";
      case "red": return "bg-red-500";
      default: return "bg-muted";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "green": return "On Track";
      case "amber": return "Needs Attention";
      case "red": return "Critical";
      default: return "Not Started";
    }
  };

  const pct = Math.min(kpi.achievement_percentage || 0, 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {kpi.title}
            <Badge className={`${getStatusColor(kpi.status)} text-white`}>
              {getStatusLabel(kpi.status)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {kpi.description && (
            <p className="text-sm text-muted-foreground">{kpi.description}</p>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Target:</span> <strong>{kpi.target_value}</strong></div>
            <div><span className="text-muted-foreground">Achieved:</span> <strong>{kpi.achieved_value || 0}</strong></div>
            <div><span className="text-muted-foreground">Weightage:</span> <strong>{kpi.weightage}%</strong></div>
            <div><span className="text-muted-foreground">Due:</span> <strong>{format(new Date(kpi.due_date), "dd MMM yyyy")}</strong></div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>Achievement</span>
              <span className="font-medium">{pct.toFixed(1)}%</span>
            </div>
            <Progress value={pct} className="h-3" />
          </div>

          {!readOnly && (
            <div className="space-y-3 border-t pt-4">
              <h4 className="font-medium">Update Progress</h4>
              <div className="space-y-2">
                <Label>Achieved Value</Label>
                <Input
                  type="number"
                  value={achievedValue}
                  onChange={e => setAchievedValue(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add progress notes..."
                  rows={2}
                />
              </div>
              <Button onClick={handleSubmit} disabled={submitting} className="w-full">
                {submitting ? "Updating..." : "Submit Progress"}
              </Button>
            </div>
          )}

          {progressHistory.length > 0 && (
            <div className="space-y-2 border-t pt-4">
              <h4 className="font-medium text-sm">Update History</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {progressHistory.map((p) => (
                  <div key={p.id} className="p-2 bg-muted/50 rounded text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">Value: {p.achieved_value}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(p.created_at), "dd MMM yyyy HH:mm")}
                      </span>
                    </div>
                    {p.progress_notes && <p className="text-muted-foreground mt-1">{p.progress_notes}</p>}
                    <p className="text-xs text-muted-foreground">by {p.updated_by_name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
