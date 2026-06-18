import { useState, useEffect, useMemo } from "react";
import { Header } from "@/components/Header";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RepairStageBadge } from "@/components/repairs/RepairStageBadge";
import { useAuth } from "@/hooks/useAuth";
import { useRepairs, Repair, RepairFormData, ISSUE_TYPES, PAYMENT_STATUSES } from "@/hooks/useRepairs";
import { RepairCard } from "@/components/repairs/RepairCard";
import { RepairForm } from "@/components/repairs/RepairForm";
import { RepairImportDialog } from "@/components/repairs/RepairImportDialog";
import { RepairDialog } from "@/components/repairs/RepairDialog";
import { RepairPartsAnalytics } from "@/components/repairs/RepairPartsAnalytics";
import { RepairStageDistribution } from "@/components/repairs/RepairStageDistribution";
import { REPAIR_STAGES } from "@/hooks/useRepairs";
import { Plus, Search, Wrench, IndianRupee, Clock, CheckCircle, Upload, Download, Loader2, CalendarRange, LayoutGrid, List as ListIcon, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { format } from "date-fns";
import { exportRepairsToExcel } from "@/utils/repairExportHelpers";
import { toast } from "sonner";
import { useDateFilter } from "@/hooks/useDateFilter";
import { MonthFilter } from "@/components/MonthFilter";

export default function Repairs() {
  const { user, profile } = useAuth();
  const { repairs, loading, createRepair, updateRepair, deleteRepair, refetch } = useRepairs();
  
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedRepair, setSelectedRepair] = useState<Repair | null>(null);

  // Keep selectedRepair in sync with the live repairs list so updates
  // (e.g. adding/removing components in the dialog) reflect immediately
  // instead of showing a stale snapshot from when the row was opened.
  useEffect(() => {
    if (!selectedRepair) return;
    const fresh = repairs.find((r) => r.id === selectedRepair.id);
    if (fresh && fresh !== selectedRepair) {
      setSelectedRepair(fresh);
    }
  }, [repairs, selectedRepair]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [issueFilter, setIssueFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [exporting, setExporting] = useState(false);

  type RepairSortKey =
    | "repair_number" | "customer_name" | "model_name" | "issue_type"
    | "status" | "payment_status" | "repair_stage" | "assigned_technician_name"
    | "created_at" | "total_quote_amount" | "balance_amount" | "profit";
  const [sortKey, setSortKey] = useState<RepairSortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const toggleSort = (k: RepairSortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };
  const dateFilter = useDateFilter("current_month");

  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    const saved = window.localStorage.getItem("repairs_view_mode");
    return saved === "list" ? "list" : "grid";
  });

  useEffect(() => {
    try {
      window.localStorage.setItem("repairs_view_mode", viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  const paymentBadgeClass: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    partial: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const filename = exportRepairsToExcel(filteredRepairs);
      toast.success(`Exported ${filteredRepairs.length} repairs to ${filename}`);
    } catch (err: any) {
      toast.error(err.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  // Filter repairs
  const filteredRepairs = repairs.filter((repair) => {
    const matchesSearch = 
      repair.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repair.model_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repair.repair_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repair.contact_no.includes(searchQuery);
    
    const matchesStatus = statusFilter === "all" || repair.payment_status === statusFilter;
    const matchesIssue = issueFilter === "all" || repair.issue_type === issueFilter;
    const matchesStage = stageFilter === "all" || repair.repair_stage === stageFilter;
    const matchesDate = dateFilter.inRange(repair.created_at);

    return matchesSearch && matchesStatus && matchesIssue && matchesStage && matchesDate;
  });

  // Calculate stats (filtered by selected period)
  const stats = {
    total: filteredRepairs.length,
    pending: filteredRepairs.filter(r => !r.date_completed).length,
    completed: filteredRepairs.filter(r => r.date_completed).length,
    totalRevenue: filteredRepairs.reduce((sum, r) => sum + (r.total_quote_amount || 0), 0),
    totalProfit: filteredRepairs.reduce((sum, r) => sum + (r.profit || 0), 0),
    pendingPayments: filteredRepairs.filter(r => r.payment_status !== 'paid').length,
    monthlyRevenue: filteredRepairs
      .filter(r => r.payment_status === 'paid')
      .reduce((sum, r) => sum + (r.total_quote_amount || 0), 0),
  };

  const handleCreate = async (data: RepairFormData) => {
    if (!user || !profile) return;
    await createRepair(data, user.id, profile.name || "Unknown");
    setShowCreateDialog(false);
  };

  const handleUpdate = async (id: string, data: Partial<RepairFormData>) => {
    await updateRepair(id, data);
  };

  const handleDelete = async (id: string) => {
    await deleteRepair(id);
    setSelectedRepair(null);
  };

  const sortedRepairs = useMemo(() => {
    if (!sortKey) return filteredRepairs;
    const dir = sortDir === "asc" ? 1 : -1;
    const arr = [...filteredRepairs];
    arr.sort((a: any, b: any) => {
      let av: any; let bv: any;
      if (sortKey === "status") {
        av = a.date_completed ? 1 : 0; bv = b.date_completed ? 1 : 0;
      } else if (sortKey === "created_at") {
        av = new Date(a.created_at).getTime() || 0;
        bv = new Date(b.created_at).getTime() || 0;
      } else if (sortKey === "total_quote_amount" || sortKey === "balance_amount" || sortKey === "profit") {
        av = Number(a[sortKey]) || 0; bv = Number(b[sortKey]) || 0;
      } else {
        av = (a[sortKey] ?? "").toString().toLowerCase();
        bv = (b[sortKey] ?? "").toString().toLowerCase();
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [filteredRepairs, sortKey, sortDir]);

  const SortHead = ({ label, k, align }: { label: string; k: RepairSortKey; align?: "right" }) => {
    const active = sortKey === k;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead className={`whitespace-nowrap ${align === "right" ? "text-right" : ""}`}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${align === "right" ? "ml-auto" : ""}`}
        >
          {label}
          <Icon className={`h-3.5 w-3.5 ${active ? "text-foreground" : "opacity-60"}`} />
        </button>
      </TableHead>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Header />
      
      <main className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Repair Management</h1>
            <p className="text-muted-foreground">Track and manage drone repair jobs</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport} disabled={exporting || filteredRepairs.length === 0}>
              {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Export Excel
            </Button>
            <Button variant="outline" onClick={() => setShowImportDialog(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Import Excel
            </Button>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Repair Job
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Jobs</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-500" />
                <span className="text-sm text-muted-foreground">In Progress</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.pending}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">Completed</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.completed}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <IndianRupee className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Revenue</span>
              </div>
              <p className="text-2xl font-bold mt-1">₹{stats.totalRevenue.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <IndianRupee className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">Total Profit</span>
              </div>
              <p className={`text-2xl font-bold mt-1 ${stats.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ₹{stats.totalProfit.toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <IndianRupee className="h-4 w-4 text-yellow-500" />
                <span className="text-sm text-muted-foreground">Pending Pay</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.pendingPayments}</p>
            </CardContent>
          </Card>
          <Card className="border-primary/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CalendarRange className="h-4 w-4 text-primary" />
                <span className="text-sm text-muted-foreground">
                  {dateFilter.preset === "custom" ? "Revenue (Selected Period)" : "Monthly Revenue"}
                </span>
              </div>
              <p className="text-2xl font-bold mt-1 text-primary">₹{stats.monthlyRevenue.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">{dateFilter.rangeLabel}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by customer, model, or repair number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <MonthFilter filter={dateFilter} />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Payment Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {PAYMENT_STATUSES.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={issueFilter} onValueChange={setIssueFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Issue Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Issues</SelectItem>
              {ISSUE_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Repair Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {REPAIR_STAGES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => {
              if (v === "grid" || v === "list") setViewMode(v);
            }}
            className="border rounded-md"
            aria-label="View mode"
          >
            <ToggleGroupItem value="grid" aria-label="Grid view" className="h-10 px-3">
              <LayoutGrid className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view" className="h-10 px-3">
              <ListIcon className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Stage distribution strip */}
        <div className="mb-4">
          <RepairStageDistribution
            repairs={repairs.filter((r) => dateFilter.inRange(r.created_at))}
            activeStage={stageFilter === "all" ? undefined : stageFilter}
            onStageClick={(s) =>
              setStageFilter((prev) => (prev === s ? "all" : s))
            }
          />
        </div>

        {/* Parts cost vs revenue analytics */}
        <div className="mb-6">
          <RepairPartsAnalytics repairs={filteredRepairs} />
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredRepairs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Wrench className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No repair jobs found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || statusFilter !== "all" || issueFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Create your first repair job to get started"}
              </p>
              {!searchQuery && statusFilter === "all" && issueFilter === "all" && (
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Repair Job
                </Button>
              )}
            </CardContent>
          </Card>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRepairs.map((repair) => (
              <RepairCard
                key={repair.id}
                repair={repair}
                onClick={() => setSelectedRepair(repair)}
              />
            ))}
          </div>
        ) : (
          <>
            {/* Mobile fallback to grid (list is cramped on small screens) */}
            <div className="grid grid-cols-1 sm:hidden gap-4">
              {filteredRepairs.map((repair) => (
                <RepairCard
                  key={repair.id}
                  repair={repair}
                  onClick={() => setSelectedRepair(repair)}
                />
              ))}
            </div>
            <Card className="hidden sm:block">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHead label="Repair #" k="repair_number" />
                      <SortHead label="Customer" k="customer_name" />
                      <SortHead label="Model" k="model_name" />
                      <SortHead label="Issue" k="issue_type" />
                      <SortHead label="Status" k="status" />
                      <SortHead label="Payment" k="payment_status" />
                      <SortHead label="Stage" k="repair_stage" />
                      <SortHead label="Assignee" k="assigned_technician_name" />
                      <SortHead label="Date" k="created_at" />
                      <SortHead label="Amount" k="total_quote_amount" align="right" />
                      <SortHead label="Balance" k="balance_amount" align="right" />
                      <SortHead label="Profit" k="profit" align="right" />
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRepairs.map((repair) => {
                      const issueLabel =
                        ISSUE_TYPES.find((t) => t.value === repair.issue_type)?.label ||
                        repair.issue_type;
                      const payCls =
                        paymentBadgeClass[repair.payment_status] || paymentBadgeClass.pending;
                      const payLabel =
                        PAYMENT_STATUSES.find((p) => p.value === repair.payment_status)
                          ?.label || repair.payment_status;
                      const statusLabel = repair.date_completed ? "Completed" : "In Progress";
                      return (
                        <TableRow
                          key={repair.id}
                          className="cursor-pointer"
                          onClick={() => setSelectedRepair(repair)}
                        >
                          <TableCell className="font-mono text-xs whitespace-nowrap">
                            {repair.repair_number || "—"}
                          </TableCell>
                          <TableCell className="font-medium whitespace-nowrap">
                            {repair.customer_name}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{repair.model_name}</TableCell>
                          <TableCell className="whitespace-nowrap">{issueLabel}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Badge variant={repair.date_completed ? "default" : "secondary"}>
                              {statusLabel}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Badge className={payCls}>{payLabel}</Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <RepairStageBadge stage={repair.repair_stage} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {repair.assigned_technician_name || "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {format(new Date(repair.created_at), "dd MMM yyyy")}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right">
                            ₹{(repair.total_quote_amount || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right">
                            ₹{(repair.balance_amount || 0).toLocaleString()}
                          </TableCell>
                          <TableCell
                            className={`whitespace-nowrap text-right font-medium ${
                              (repair.profit || 0) >= 0 ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            ₹{(repair.profit || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRepair(repair);
                              }}
                            >
                              Open
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </>
        )}
      </main>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Create New Repair Job</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-100px)] pr-4">
            <RepairForm
              onSubmit={handleCreate}
              onCancel={() => setShowCreateDialog(false)}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <RepairDialog
        repair={selectedRepair}
        open={!!selectedRepair}
        onOpenChange={(open) => !open && setSelectedRepair(null)}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />

      {/* Import Dialog */}
      <RepairImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onSuccess={() => {
          refetch();
          setShowImportDialog(false);
        }}
      />

      <MobileBottomNav />
    </div>
  );
}
