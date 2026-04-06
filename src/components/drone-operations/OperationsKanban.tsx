import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import type { DroneOperation } from "@/hooks/useDroneOperations";

interface Props {
  operations: DroneOperation[];
  employeeMap: Record<string, string>;
  onView: (op: DroneOperation) => void;
}

const COLUMNS = ["Planned", "In Progress", "Completed", "Cancelled"] as const;

const columnColors: Record<string, string> = {
  Planned: "border-t-blue-500",
  "In Progress": "border-t-yellow-500",
  Completed: "border-t-green-500",
  Cancelled: "border-t-red-500",
};

export function OperationsKanban({ operations, employeeMap, onView }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {COLUMNS.map(col => {
        const colOps = operations.filter(op => op.status === col);
        return (
          <div key={col} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-semibold text-sm">{col}</h3>
              <Badge variant="secondary" className="text-xs">{colOps.length}</Badge>
            </div>
            <div className="space-y-2 min-h-[200px]">
              {colOps.map(op => (
                <Card key={op.id} className={`border-t-4 ${columnColors[col]} cursor-pointer hover:shadow-md transition-shadow`} onClick={() => onView(op)}>
                  <CardContent className="p-3 space-y-2">
                    <div className="font-medium text-sm">{op.project_name}</div>
                    <div className="text-xs text-muted-foreground">{op.client_name}</div>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">{op.activity_type}</Badge>
                      <span className="text-xs text-muted-foreground">{format(new Date(op.activity_datetime), "dd MMM")}</span>
                    </div>
                    {op.team_members.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {op.team_members.slice(0, 2).map(id => (
                          <span key={id} className="text-xs bg-muted px-1.5 py-0.5 rounded">{employeeMap[id] || "..."}</span>
                        ))}
                        {op.team_members.length > 2 && <span className="text-xs text-muted-foreground">+{op.team_members.length - 2}</span>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
