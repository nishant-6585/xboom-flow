import { useState, useEffect, useCallback } from "react";
import { format, subDays, startOfYear } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, Download, FileText, Users, Loader2, ChevronLeft, ChevronRight, Clock, CheckCircle2, XCircle, BarChart3, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useLeaveHistory, LeaveHistoryFilters } from "@/hooks/useLeaveHistory";
import { exportLeaveHistoryToExcel } from "@/utils/leaveHistoryExport";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { LEAVE_HISTORY_TYPE_OPTIONS, getLeaveTypeLabel } from "@/lib/leaveTypeLabels";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  approved: { label: 'Approved', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  submitted: { label: 'Pending', variant: 'secondary' },
  draft: { label: 'Draft', variant: 'outline' },
  cancelled: { label: 'Cancelled', variant: 'outline' },
};

const defaultFilters: LeaveHistoryFilters = {
  employeeId: '',
  leaveType: '',
  status: 'all',
  startDate: format(startOfYear(new Date()), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  includePending: false,
};

interface EmployeeOption {
  id: string;
  name: string;
}

export function LeaveHistoryPanel() {
  const { records, kpis, summaries, loading, totalCount, page, fetchAll, setPage, fetchForExport, deleteLeaveEntry, pageSize } = useLeaveHistory();
  const { role } = useAuth();
  const canDelete = role === 'admin' || role === 'hr';
  const [filters, setFilters] = useState<LeaveHistoryFilters>(defaultFilters);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [exporting, setExporting] = useState(false);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'records' | 'summary'>('records');
  const [deleteTarget, setDeleteTarget] = useState<typeof records[number] | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Fetch employees for dropdown
  useEffect(() => {
    supabase
      .from('employees')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        setEmployees((data || []).map((e: any) => ({ id: e.id, name: e.name })));
      });
  }, []);

  // Fetch data on mount and filter change
  useEffect(() => {
    fetchAll(filters, 0);
  }, [filters, fetchAll]);

  const handlePageChange = useCallback((newPage: number) => {
    fetchAll(filters, newPage);
  }, [filters, fetchAll]);

  const handleQuickFilter = useCallback((days: number | 'year') => {
    if (days === 'year') {
      setFilters(prev => ({
        ...prev,
        startDate: format(startOfYear(new Date()), 'yyyy-MM-dd'),
        endDate: format(new Date(), 'yyyy-MM-dd'),
      }));
    } else {
      setFilters(prev => ({
        ...prev,
        startDate: format(subDays(new Date(), days), 'yyyy-MM-dd'),
        endDate: format(new Date(), 'yyyy-MM-dd'),
      }));
    }
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const allRecords = await fetchForExport(filters);
      exportLeaveHistoryToExcel(allRecords);
      toast.success(`Exported ${allRecords.length} leave records`);
    } catch (err: any) {
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [filters, fetchForExport]);

  const handleReset = useCallback(() => {
    setFilters(defaultFilters);
  }, []);

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Filters</h3>
            <div className="flex gap-1.5">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleQuickFilter(7)}>7 Days</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleQuickFilter(30)}>30 Days</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleQuickFilter('year')}>This Year</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleReset}>Reset</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {/* Employee */}
            <Select value={filters.employeeId || "all_employees"} onValueChange={v => setFilters(prev => ({ ...prev, employeeId: v === 'all_employees' ? '' : v }))}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="All Employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_employees">All Employees</SelectItem>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Leave Type */}
            <Select value={filters.leaveType || "all_types"} onValueChange={v => setFilters(prev => ({ ...prev, leaveType: v === 'all_types' ? '' : v }))}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_types">All Types</SelectItem>
                {LEAVE_HISTORY_TYPE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status */}
            <Select value={filters.status || "all"} onValueChange={v => setFilters(prev => ({ ...prev, status: v }))}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Approved & Rejected</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>

            {/* Start Date */}
            <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-9 text-sm justify-start font-normal", !filters.startDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                  {filters.startDate ? format(new Date(filters.startDate), "dd MMM yyyy") : "From"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={filters.startDate ? new Date(filters.startDate) : undefined}
                  onSelect={d => { setFilters(prev => ({ ...prev, startDate: d ? format(d, 'yyyy-MM-dd') : '' })); setStartDateOpen(false); }}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>

            {/* End Date */}
            <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-9 text-sm justify-start font-normal", !filters.endDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                  {filters.endDate ? format(new Date(filters.endDate), "dd MMM yyyy") : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={filters.endDate ? new Date(filters.endDate) : undefined}
                  onSelect={d => { setFilters(prev => ({ ...prev, endDate: d ? format(d, 'yyyy-MM-dd') : '' })); setEndDateOpen(false); }}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <FileText className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{kpis.totalLeaves}</p>
            <p className="text-xs text-muted-foreground">Total Leaves</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Clock className="h-5 w-5 mx-auto text-primary/70 mb-1" />
            <p className="text-2xl font-bold">{kpis.totalDays}</p>
            <p className="text-xs text-muted-foreground">Total Days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <CheckCircle2 className="h-5 w-5 mx-auto text-accent-foreground mb-1" />
            <p className="text-2xl font-bold">{kpis.approvedCount}</p>
            <p className="text-xs text-muted-foreground">Approved</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <XCircle className="h-5 w-5 mx-auto text-destructive mb-1" />
            <p className="text-2xl font-bold">{kpis.rejectedCount}</p>
            <p className="text-xs text-muted-foreground">Rejected</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <BarChart3 className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-2xl font-bold">{kpis.avgDaysPerEmployee}</p>
            <p className="text-xs text-muted-foreground">Avg Days/Employee</p>
          </CardContent>
        </Card>
      </div>

      {/* View Toggle + Export */}
      <div className="flex items-center justify-between">
        <Tabs value={viewMode} onValueChange={v => setViewMode(v as any)}>
          <TabsList className="h-8">
            <TabsTrigger value="records" className="text-xs h-7 gap-1"><FileText className="h-3.5 w-3.5" /> Records</TabsTrigger>
            <TabsTrigger value="summary" className="text-xs h-7 gap-1"><Users className="h-3.5 w-3.5" /> Summary</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleExport} disabled={exporting || totalCount === 0}>
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Export Excel
        </Button>
      </div>

      {/* Records Table */}
      {viewMode === 'records' && (
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : records.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p>No leave records found</p>
                <p className="text-xs mt-1">Try adjusting your filters</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Employee</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs">Start</TableHead>
                        <TableHead className="text-xs">End</TableHead>
                        <TableHead className="text-xs text-center">Days</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Applied On</TableHead>
                        {canDelete && <TableHead className="text-xs text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map(r => (
                        <TableRow key={r.id}>
                          <TableCell className="text-sm font-medium">{r.employee_name}</TableCell>
                          <TableCell className="text-sm">{getLeaveTypeLabel(r.leave_type)}</TableCell>
                          <TableCell className="text-sm">{format(new Date(r.start_date), 'dd MMM yyyy')}</TableCell>
                          <TableCell className="text-sm">{format(new Date(r.end_date), 'dd MMM yyyy')}</TableCell>
                          <TableCell className="text-sm text-center font-medium">{r.total_days}</TableCell>
                          <TableCell>
                            <Badge variant={STATUS_CONFIG[r.status]?.variant || 'outline'} className="text-xs">
                              {STATUS_CONFIG[r.status]?.label || r.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{format(new Date(r.created_at), 'dd MMM yyyy')}</TableCell>
                          {canDelete && (
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => { setDeleteTarget(r); setDeleteReason(''); }}
                                title="Delete leave entry"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-xs text-muted-foreground">
                      Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount}
                    </p>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => handlePageChange(page - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages - 1} onClick={() => handlePageChange(page + 1)}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary View */}
      {viewMode === 'summary' && (
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : summaries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p>No approved leave data found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Employee</TableHead>
                      <TableHead className="text-xs text-center">EL Days</TableHead>
                      <TableHead className="text-xs text-center">Sick Days</TableHead>
                      <TableHead className="text-xs text-center">Other Days</TableHead>
                      <TableHead className="text-xs text-center">Total Days</TableHead>
                      <TableHead className="text-xs text-center">Total Leaves</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaries.map(s => (
                      <TableRow key={s.employee_id}>
                        <TableCell className="text-sm font-medium">{s.employee_name}</TableCell>
                        <TableCell className="text-sm text-center">{s.el_days || '—'}</TableCell>
                        <TableCell className="text-sm text-center">{s.sick_days || '—'}</TableCell>
                        <TableCell className="text-sm text-center">{s.other_days || '—'}</TableCell>
                        <TableCell className="text-sm text-center font-medium">{s.el_days + s.sick_days + s.other_days}</TableCell>
                        <TableCell className="text-sm text-center">{s.total_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete leave entry?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  This will permanently delete{' '}
                  <span className="font-medium text-foreground">{deleteTarget?.employee_name}</span>'s{' '}
                  <span className="font-medium text-foreground">{deleteTarget && (LEAVE_TYPE_LABELS[deleteTarget.leave_type] || deleteTarget.leave_type)}</span>{' '}
                  ({deleteTarget?.total_days} day{(deleteTarget?.total_days ?? 0) === 1 ? '' : 's'}) from{' '}
                  {deleteTarget && format(new Date(deleteTarget.start_date), 'dd MMM yyyy')} – {deleteTarget && format(new Date(deleteTarget.end_date), 'dd MMM yyyy')}.
                </div>
                {deleteTarget?.status === 'approved' && ['EL','half_day_EL','casual','half_day_casual','paid','half_day_paid','sick','half_day_sick'].includes(deleteTarget.leave_type) && (
                  <div className="rounded-md bg-muted px-3 py-2 text-xs">
                    💡 The leave balance ({deleteTarget.total_days} day{deleteTarget.total_days === 1 ? '' : 's'}) will be refunded to the employee.
                  </div>
                )}
                <div>This action cannot be undone.</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Reason (optional)</label>
            <Textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="e.g. Employee came to office / applied by mistake"
              rows={2}
              className="text-sm"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={async (e) => {
                e.preventDefault();
                if (!deleteTarget) return;
                setDeleting(true);
                const ok = await deleteLeaveEntry(deleteTarget.id, deleteReason.trim() || undefined);
                setDeleting(false);
                if (ok) {
                  setDeleteTarget(null);
                  setDeleteReason('');
                  // Refresh KPIs/summaries
                  fetchAll(filters, page);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Deleting…</> : 'Delete entry'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
