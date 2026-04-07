import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Eye, Loader2, Zap } from "lucide-react";
import { SalarySheet, SalarySheetStatus, useSalarySheets } from "@/hooks/useSalarySheets";
import { SalarySheetCreateDialog } from "./SalarySheetCreateDialog";
import { SalarySheetView } from "./SalarySheetView";

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const STATUS_LABELS: Record<SalarySheetStatus, string> = {
  draft: "Draft",
  hr_approved: "HR Approved",
  finance_approved: "Finance Approved",
  locked: "Locked",
};

const STATUS_COLORS: Record<SalarySheetStatus, string> = {
  draft: "",
  hr_approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  finance_approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  locked: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function SalarySheetsList() {
  const { sheets, loading, fetchSheets, createSheet, lockSheet } = useSalarySheets();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewSheet, setViewSheet] = useState<SalarySheet | null>(null);

  useEffect(() => { fetchSheets(); }, [fetchSheets]);

  if (viewSheet) {
    return (
      <SalarySheetView
        sheet={viewSheet}
        onBack={() => { setViewSheet(null); fetchSheets(); }}
        onLock={async () => {
          const ok = await lockSheet(viewSheet.id);
          if (ok) setViewSheet({ ...viewSheet, status: "locked" });
        }}
        onStatusChange={() => fetchSheets()}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg">Salary Sheets</CardTitle>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Create Salary Sheet
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : sheets.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No salary sheets yet. Create one to get started.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheets.map((sheet) => (
                  <TableRow key={sheet.id}>
                    <TableCell className="font-medium">{MONTH_NAMES[sheet.month]}</TableCell>
                    <TableCell>{sheet.year}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={sheet.status === "locked" ? "secondary" : "outline"} className={STATUS_COLORS[sheet.status]}>
                          {STATUS_LABELS[sheet.status]}
                        </Badge>
                        {sheet.created_by_name === "System (Auto)" && (
                          <Badge variant="outline" className="gap-1 text-[10px] border-primary/30 text-primary">
                            <Zap className="w-2.5 h-2.5" /> Auto
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{sheet.created_by_name}</TableCell>
                    <TableCell>{format(new Date(sheet.created_at), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setViewSheet(sheet)}>
                        <Eye className="h-4 w-4 mr-1" /> View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <SalarySheetCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={async (month, year) => {
          const result = await createSheet(month, year);
          if (result) { setCreateOpen(false); setViewSheet(result); }
        }}
      />
    </Card>
  );
}
