import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Download } from "lucide-react";
import type { DroneOperation } from "@/hooks/useDroneOperations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operation: DroneOperation | null;
  employeeMap: Record<string, string>;
  onDownloadReport: (url: string) => void;
}

export function OperationDetailDialog({ open, onOpenChange, operation, employeeMap, onDownloadReport }: Props) {
  if (!operation) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{operation.project_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-muted-foreground">Date & Time:</span><br />{format(new Date(operation.activity_datetime), "dd MMM yyyy, hh:mm a")}</div>
            <div><span className="text-muted-foreground">Type:</span><br /><Badge variant="secondary">{operation.activity_type}</Badge></div>
            <div><span className="text-muted-foreground">Client:</span><br />{operation.client_name}</div>
            <div><span className="text-muted-foreground">Location:</span><br />{operation.location || "—"}</div>
            <div><span className="text-muted-foreground">Status:</span><br /><Badge variant="secondary">{operation.status}</Badge></div>
          </div>

          {operation.equipment_used.length > 0 && (
            <div>
              <span className="text-muted-foreground">Equipment:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {operation.equipment_used.map((eq, i) => <Badge key={i} variant="outline">{eq.type}: {eq.model}</Badge>)}
              </div>
            </div>
          )}

          {operation.team_members.length > 0 && (
            <div>
              <span className="text-muted-foreground">Team:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {operation.team_members.map(id => <Badge key={id} variant="outline">{employeeMap[id] || id.slice(0, 8)}</Badge>)}
              </div>
            </div>
          )}

          {operation.work_description && (
            <div><span className="text-muted-foreground">Description:</span><p className="mt-1">{operation.work_description}</p></div>
          )}

          {operation.remarks && (
            <div><span className="text-muted-foreground">Remarks:</span><p className="mt-1">{operation.remarks}</p></div>
          )}

          {operation.report_file_url && (
            <Button variant="outline" size="sm" onClick={() => onDownloadReport(operation.report_file_url!)}>
              <Download className="h-4 w-4 mr-2" />Download Report
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
