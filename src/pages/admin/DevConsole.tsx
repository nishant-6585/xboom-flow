import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, RefreshCw, ArrowLeft, Bug, ShieldAlert, Zap, Trash2, Layers, Paintbrush, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface DevReport {
  id: string;
  repo: string;
  branch: string;
  commit_sha: string | null;
  commit_range: string | null;
  summary: string | null;
  total_issues: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  info_count: number;
  trigger_type: string;
  status: string;
  triggered_at: string;
  created_at: string;
}

interface DevReportIssue {
  id: string;
  report_id: string;
  file_path: string | null;
  line_number: number | null;
  severity: string;
  category: string;
  message: string;
  suggestion: string | null;
  code_snippet: string | null;
  resolution_status: string;
  resolved_at: string | null;
  created_at: string;
}

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

function severityBadge(severity: string) {
  const s = severity.toLowerCase();
  if (s === "critical") return <Badge className="bg-red-700 hover:bg-red-800 text-white">Critical</Badge>;
  if (s === "high") return <Badge className="bg-orange-600 hover:bg-orange-700 text-white">High</Badge>;
  if (s === "medium") return <Badge className="bg-yellow-600 hover:bg-yellow-700 text-white">Medium</Badge>;
  if (s === "low") return <Badge className="bg-blue-600 hover:bg-blue-700 text-white">Low</Badge>;
  return <Badge variant="secondary">Info</Badge>;
}

function categoryIcon(category: string) {
  const c = category.toLowerCase();
  if (c === "bug") return <Bug className="h-3.5 w-3.5 text-red-500" />;
  if (c === "security") return <ShieldAlert className="h-3.5 w-3.5 text-orange-500" />;
  if (c === "performance") return <Zap className="h-3.5 w-3.5 text-yellow-500" />;
  if (c === "cleanup") return <Trash2 className="h-3.5 w-3.5 text-gray-500" />;
  if (c === "architecture") return <Layers className="h-3.5 w-3.5 text-purple-500" />;
  return <Paintbrush className="h-3.5 w-3.5 text-gray-400" />;
}

function resolutionBadge(status: string) {
  if (status === "fixed") return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">Fixed</Badge>;
  if (status === "ignored") return <Badge variant="secondary">Ignored</Badge>;
  if (status === "wontfix") return <Badge variant="outline">Won't Fix</Badge>;
  return <Badge variant="outline" className="border-slate-400 text-slate-600">Open</Badge>;
}

export default function DevConsole() {
  const { role } = useAuth();
  const [reports, setReports] = useState<DevReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<DevReport | null>(null);
  const [issues, setIssues] = useState<DevReportIssue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("open");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  if (role !== "admin") return <Navigate to="/" replace />;

  async function loadReports() {
    setLoading(true);
    const { data, error } = await supabase
      .from("dev_reports")
      .select("*")
      .order("triggered_at", { ascending: false })
      .limit(50);
    if (error) toast.error("Failed to load reports");
    else setReports(data ?? []);
    setLoading(false);
  }

  async function loadIssues(reportId: string) {
    setIssuesLoading(true);
    const { data, error } = await supabase
      .from("dev_report_issues")
      .select("*")
      .eq("report_id", reportId)
      .order("severity", { ascending: true });
    if (error) toast.error("Failed to load issues");
    else setIssues((data ?? []).sort((a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
    ));
    setIssuesLoading(false);
  }

  async function openReport(report: DevReport) {
    setSelectedReport(report);
    await loadIssues(report.id);
    if (report.status === "new") {
      await supabase.from("dev_reports").update({ status: "reviewed" }).eq("id", report.id);
      setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: "reviewed" } : r));
    }
  }

  async function updateIssueStatus(issueId: string, newStatus: string) {
    setUpdatingId(issueId);
    const { error } = await supabase
      .from("dev_report_issues")
      .update({
        resolution_status: newStatus,
        resolved_at: newStatus !== "open" ? new Date().toISOString() : null,
      })
      .eq("id", issueId);
    if (error) {
      toast.error("Failed to update issue");
    } else {
      setIssues(prev => prev.map(i =>
        i.id === issueId ? { ...i, resolution_status: newStatus } : i
      ));
      toast.success("Issue updated");
    }
    setUpdatingId(null);
  }

  useEffect(() => { loadReports(); }, []);

  const filteredIssues = issues.filter(issue => {
    if (severityFilter !== "all" && issue.severity !== severityFilter) return false;
    if (categoryFilter !== "all" && issue.category !== categoryFilter) return false;
    if (statusFilter !== "all" && issue.resolution_status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold">Developer Console</h1>
            <p className="text-sm text-muted-foreground">Automated code review reports — TimoDesk</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadReports} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Report list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p className="font-medium">No reports yet</p>
            <p className="text-sm mt-1">Reports appear here after the weekly GitHub Actions run, or after a manual trigger.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map(report => (
            <Card
              key={report.id}
              className={`cursor-pointer transition-colors hover:bg-muted/40 ${report.status === "new" ? "border-blue-400/60" : ""}`}
              onClick={() => openReport(report)}
            >
              <CardContent className="py-4 px-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{report.repo}</span>
                        <span className="text-xs text-muted-foreground font-mono">{report.branch}</span>
                        {report.commit_sha && (
                          <span className="text-xs text-muted-foreground font-mono">{report.commit_sha.slice(0, 7)}</span>
                        )}
                        {report.status === "new" && (
                          <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-xs">New</Badge>
                        )}
                        {report.trigger_type === "manual" && (
                          <Badge variant="outline" className="text-xs">Manual</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(report.triggered_at), "d MMM yyyy, h:mm a")}
                        {report.summary && ` — ${report.summary}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    {report.critical_count > 0 && (
                      <Badge className="bg-red-700 text-white text-xs">{report.critical_count} critical</Badge>
                    )}
                    {report.high_count > 0 && (
                      <Badge className="bg-orange-600 text-white text-xs">{report.high_count} high</Badge>
                    )}
                    {report.medium_count > 0 && (
                      <Badge className="bg-yellow-600 text-white text-xs">{report.medium_count} med</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{report.total_issues} total</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Issue drill-in dialog */}
      <Dialog open={!!selectedReport} onOpenChange={open => { if (!open) setSelectedReport(null); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedReport?.repo}
              <span className="text-sm font-normal text-muted-foreground">
                {selectedReport && format(new Date(selectedReport.triggered_at), "d MMM yyyy, h:mm a")}
              </span>
            </DialogTitle>
            {selectedReport?.summary && (
              <p className="text-sm text-muted-foreground">{selectedReport.summary}</p>
            )}
          </DialogHeader>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap shrink-0">
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="security">Security</SelectItem>
                <SelectItem value="performance">Performance</SelectItem>
                <SelectItem value="cleanup">Cleanup</SelectItem>
                <SelectItem value="architecture">Architecture</SelectItem>
                <SelectItem value="style">Style</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="fixed">Fixed</SelectItem>
                <SelectItem value="ignored">Ignored</SelectItem>
                <SelectItem value="wontfix">Won't Fix</SelectItem>
              </SelectContent>
            </Select>

            <span className="text-xs text-muted-foreground self-center ml-auto">
              {filteredIssues.length} of {issues.length} issues
            </span>
          </div>

          {/* Issues table */}
          <div className="overflow-auto flex-1">
            {issuesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredIssues.length === 0 ? (
              <p className="text-center text-muted-foreground py-12 text-sm">No issues match the current filters.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Severity</TableHead>
                    <TableHead className="w-28">Category</TableHead>
                    <TableHead>Issue</TableHead>
                    <TableHead className="w-36">File</TableHead>
                    <TableHead className="w-32">Status</TableHead>
                    <TableHead className="w-28">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredIssues.map(issue => (
                    <TableRow key={issue.id} className={issue.resolution_status !== "open" ? "opacity-50" : ""}>
                      <TableCell>{severityBadge(issue.severity)}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5 text-xs capitalize">
                          {categoryIcon(issue.category)}
                          {issue.category}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{issue.message}</p>
                          {issue.suggestion && (
                            <p className="text-xs text-muted-foreground mt-0.5">{issue.suggestion}</p>
                          )}
                          {issue.code_snippet && (
                            <pre className="mt-1.5 text-xs bg-muted rounded px-2 py-1.5 overflow-x-auto max-w-md whitespace-pre-wrap font-mono">
                              {issue.code_snippet}
                            </pre>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {issue.file_path ? (
                          <span className="text-xs font-mono text-muted-foreground break-all">
                            {issue.file_path}{issue.line_number ? `:${issue.line_number}` : ""}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>{resolutionBadge(issue.resolution_status)}</TableCell>
                      <TableCell>
                        {issue.resolution_status === "open" ? (
                          <div className="flex gap-1 flex-wrap">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs"
                              disabled={updatingId === issue.id}
                              onClick={() => updateIssueStatus(issue.id, "fixed")}
                            >Fixed</Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              disabled={updatingId === issue.id}
                              onClick={() => updateIssueStatus(issue.id, "ignored")}
                            >Ignore</Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs text-muted-foreground"
                              disabled={updatingId === issue.id}
                              onClick={() => updateIssueStatus(issue.id, "wontfix")}
                            >Won't fix</Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            disabled={updatingId === issue.id}
                            onClick={() => updateIssueStatus(issue.id, "open")}
                          >Reopen</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
