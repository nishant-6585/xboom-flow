import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Pencil, Download, Trash2 } from "lucide-react";
import type { DroneOperation } from "@/hooks/useDroneOperations";

interface Props {
  operations: DroneOperation[];
  employeeMap: Record<string, string>;
  canEdit: boolean;
  onView: (op: DroneOperation) => void;
  onEdit: (op: DroneOperation) => void;
  onDelete: (id: string) => void;
  onDownloadReport: (url: string) => void;
}

const statusColors: Record<string, string> = {
  Planned: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  "In Progress": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  Completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  Cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

const typeColors: Record<string, string> = {
  Demo: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  Training: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  "Field Work": "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300",
};

export function OperationsTable({ operations, employeeMap, canEdit, onView, onEdit, onDelete, onDownloadReport }: Props) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date & Time</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Client / Location</TableHead>
            <TableHead>Equipment</TableHead>
            <TableHead>Team</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {operations.length === 0 && (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No operations found</TableCell></TableRow>
          )}
          {operations.map(op => (
            <TableRow key={op.id}>
              <TableCell className="whitespace-nowrap text-sm">{format(new Date(op.activity_datetime), "dd MMM yyyy, hh:mm a")}</TableCell>
              <TableCell><Badge className={typeColors[op.activity_type] || ""} variant="secondary">{op.activity_type}</Badge></TableCell>
              <TableCell className="font-medium">{op.project_name}</TableCell>
              <TableCell>
                <div className="text-sm">{op.client_name}</div>
                {op.location && <div className="text-xs text-muted-foreground">{op.location}</div>}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {op.equipment_used.slice(0, 2).map((eq, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{eq.type}: {eq.model}</Badge>
                  ))}
                  {op.equipment_used.length > 2 && <Badge variant="outline" className="text-xs">+{op.equipment_used.length - 2}</Badge>}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {op.team_members.slice(0, 2).map(id => (
                    <Badge key={id} variant="outline" className="text-xs">{employeeMap[id] || id.slice(0, 6)}</Badge>
                  ))}
                  {op.team_members.length > 2 && <Badge variant="outline" className="text-xs">+{op.team_members.length - 2}</Badge>}
                </div>
              </TableCell>
              <TableCell><Badge className={statusColors[op.status] || ""} variant="secondary">{op.status}</Badge></TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => onView(op)}><Eye className="h-4 w-4" /></Button>
                  {canEdit && <Button variant="ghost" size="icon" onClick={() => onEdit(op)}><Pencil className="h-4 w-4" /></Button>}
                  {op.report_file_url && <Button variant="ghost" size="icon" onClick={() => onDownloadReport(op.report_file_url!)}><Download className="h-4 w-4" /></Button>}
                  {canEdit && <Button variant="ghost" size="icon" onClick={() => onDelete(op.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
