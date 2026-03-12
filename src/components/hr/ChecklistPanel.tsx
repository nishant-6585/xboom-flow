import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Eye, Search, ClipboardList } from "lucide-react";
import { useEmployeeChecklists, EmployeeChecklist } from "@/hooks/useEmployeeChecklists";
import { ChecklistDetailDialog } from "./ChecklistDetailDialog";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  checklistType: 'onboarding' | 'offboarding';
}

const statusColors: Record<string, string> = {
  not_started: 'bg-muted text-muted-foreground',
  in_progress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
};

const statusLabels: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
};

export function ChecklistPanel({ checklistType }: Props) {
  const isMobile = useIsMobile();
  const { checklists, loading, fetchChecklists } = useEmployeeChecklists(checklistType);
  const [search, setSearch] = useState('');
  const [selectedChecklist, setSelectedChecklist] = useState<EmployeeChecklist | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    fetchChecklists();
  }, [fetchChecklists]);

  const filtered = checklists.filter(c =>
    (c.employee_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (c.employee_number?.toLowerCase() || '').includes(search.toLowerCase())
  );

  const title = checklistType === 'onboarding' ? 'Onboarding Checklists' : 'Offboarding Checklists';

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading {title.toLowerCase()}...</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="h-5 w-5" /> {title}
            </CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search employee..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No {checklistType} checklists found.
            </div>
          ) : isMobile ? (
            <div className="space-y-3">
              {filtered.map((c, idx) => (
                <Card key={c.id} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-medium text-sm">{c.employee_name}</div>
                      <div className="text-xs text-muted-foreground">{c.employee_number}</div>
                    </div>
                    <Badge className={statusColors[c.status]}>{statusLabels[c.status]}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Progress value={c.completion_percentage} className="h-2 flex-1" />
                    <span className="text-xs font-medium">{c.completion_percentage}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {checklistType === 'onboarding' && c.joining_date ? `DOJ: ${format(new Date(c.joining_date), 'dd MMM yyyy')}` : ''}
                      {checklistType === 'offboarding' && c.exit_date ? `Exit: ${format(new Date(c.exit_date), 'dd MMM yyyy')}` : ''}
                    </span>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setSelectedChecklist(c); setDetailOpen(true); }}>
                      <Eye className="h-3 w-3 mr-1" /> View
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Sl.</TableHead>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>{checklistType === 'onboarding' ? 'DOJ' : 'Date of Leaving'}</TableHead>
                    <TableHead>Completion %</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c, idx) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm">{idx + 1}</TableCell>
                      <TableCell className="text-sm font-mono">{c.employee_number}</TableCell>
                      <TableCell className="text-sm font-medium">{c.employee_name}</TableCell>
                      <TableCell className="text-sm">
                        {checklistType === 'onboarding' && c.joining_date
                          ? format(new Date(c.joining_date), 'dd MMM yyyy')
                          : checklistType === 'offboarding' && c.exit_date
                            ? format(new Date(c.exit_date), 'dd MMM yyyy')
                            : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={c.completion_percentage} className="h-2 w-20" />
                          <span className="text-xs font-medium">{c.completion_percentage}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[c.status]}>{statusLabels[c.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setSelectedChecklist(c); setDetailOpen(true); }}>
                          <Eye className="h-3 w-3 mr-1" /> View Checklist
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ChecklistDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        checklist={selectedChecklist}
        checklistType={checklistType}
        onUpdated={fetchChecklists}
      />
    </div>
  );
}
