import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import {
  Loader2,
  Shield,
  FileEdit,
  Clock,
  ChevronDown,
  Search,
  CalendarIcon,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivityItem {
  id: string;
  type: "audit" | "edit" | "session";
  action: string;
  description: string;
  timestamp: string;
  employeeName: string;
  metadata?: Record<string, any>;
}

interface EmployeeOption {
  user_id: string;
  name: string;
}

const PAGE_SIZE = 30;

const AdminEmployeeActivity = () => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  // Filters
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [activityType, setActivityType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();

  // Fetch employee list once
  useEffect(() => {
    const fetchEmployees = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, name")
        .eq("is_approved", true)
        .order("name");
      setEmployees(data || []);
    };
    fetchEmployees();
  }, []);

  const fetchActivities = useCallback(
    async (pageNum: number, append = false) => {
      const offset = pageNum * PAGE_SIZE;
      const employeeFilter = selectedEmployee !== "all" ? selectedEmployee : null;

      try {
        // Build date filters
        const fromISO = fromDate ? fromDate.toISOString() : null;
        const toISO = toDate
          ? new Date(toDate.getTime() + 86400000 - 1).toISOString()
          : null;

        // Conditionally fetch based on activityType
        const shouldFetchAudit = activityType === "all" || activityType === "audit";
        const shouldFetchEdit = activityType === "all" || activityType === "edit";
        const shouldFetchSession = activityType === "all" || activityType === "session";

        const buildAuditQuery = () => {
          let q = supabase
            .from("security_audit_log")
            .select("id, user_id, user_name, action, details, performed_at")
            .order("performed_at", { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);
          if (employeeFilter) q = q.eq("user_id", employeeFilter);
          if (fromISO) q = q.gte("performed_at", fromISO);
          if (toISO) q = q.lte("performed_at", toISO);
          return q;
        };

        const buildEditQuery = () => {
          let q = supabase
            .from("edit_history")
            .select("id, edited_by, edited_by_name, table_name, field_name, old_value, new_value, edited_at")
            .order("edited_at", { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);
          if (employeeFilter) q = q.eq("edited_by", employeeFilter);
          if (fromISO) q = q.gte("edited_at", fromISO);
          if (toISO) q = q.lte("edited_at", toISO);
          return q;
        };

        const buildSessionQuery = () => {
          let q = supabase
            .from("user_activity_logs")
            .select("id, user_id, user_name, session_start, session_end, duration_minutes, pages_visited, actions_performed")
            .order("session_start", { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);
          if (employeeFilter) q = q.eq("user_id", employeeFilter);
          if (fromISO) q = q.gte("session_start", fromISO);
          if (toISO) q = q.lte("session_start", toISO);
          return q;
        };

        const [auditRes, editRes, sessionRes] = await Promise.all([
          shouldFetchAudit ? buildAuditQuery() : Promise.resolve({ data: [] }),
          shouldFetchEdit ? buildEditQuery() : Promise.resolve({ data: [] }),
          shouldFetchSession ? buildSessionQuery() : Promise.resolve({ data: [] }),
        ]);

        const items: ActivityItem[] = [];

        // Name lookup
        const nameMap = new Map<string, string>();
        employees.forEach((e) => nameMap.set(e.user_id, e.name));

        // Map audit logs
        ((auditRes as any).data || []).forEach((a: any) => {
          const details = a.details as Record<string, any> | null;
          items.push({
            id: `audit-${a.id}`,
            type: "audit",
            action: formatAction(a.action),
            description: formatAuditDescription(a.action, details),
            timestamp: a.performed_at,
            employeeName: a.user_name || nameMap.get(a.user_id) || "Unknown",
            metadata: details || undefined,
          });
        });

        // Map edit history
        ((editRes as any).data || []).forEach((e: any) => {
          items.push({
            id: `edit-${e.id}`,
            type: "edit",
            action: `Edited ${formatTableName(e.table_name)}`,
            description: `Changed "${e.field_name}" from "${e.old_value || "—"}" to "${e.new_value || "—"}"`,
            timestamp: e.edited_at,
            employeeName: e.edited_by_name || nameMap.get(e.edited_by) || "Unknown",
          });
        });

        // Map sessions
        ((sessionRes as any).data || []).forEach((s: any) => {
          items.push({
            id: `session-${s.id}`,
            type: "session",
            action: "App Session",
            description: `${s.duration_minutes || 0} min · ${s.pages_visited || 0} pages · ${s.actions_performed || 0} actions`,
            timestamp: s.session_start,
            employeeName: s.user_name || nameMap.get(s.user_id) || "Unknown",
          });
        });

        // Sort
        items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        // Client-side search filter
        const filtered = searchQuery.trim()
          ? items.filter(
              (i) =>
                i.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                i.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
                i.description.toLowerCase().includes(searchQuery.toLowerCase())
            )
          : items;

        const totalFetched =
          ((auditRes as any).data?.length || 0) +
          ((editRes as any).data?.length || 0) +
          ((sessionRes as any).data?.length || 0);
        setHasMore(totalFetched >= PAGE_SIZE);

        if (append) {
          setActivities((prev) => [...prev, ...filtered]);
        } else {
          setActivities(filtered);
        }
      } catch (err) {
        console.error("Error fetching admin activity:", err);
      }
    },
    [selectedEmployee, activityType, fromDate, toDate, searchQuery, employees]
  );

  // Reset and refetch on filter change
  useEffect(() => {
    setPage(0);
    setHasMore(true);
    setLoading(true);
    fetchActivities(0).then(() => setLoading(false));
  }, [fetchActivities]);

  const loadMore = async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    setPage(nextPage);
    await fetchActivities(nextPage, true);
    setLoadingMore(false);
  };

  const clearFilters = () => {
    setSelectedEmployee("all");
    setActivityType("all");
    setSearchQuery("");
    setFromDate(undefined);
    setToDate(undefined);
  };

  const hasActiveFilters =
    selectedEmployee !== "all" ||
    activityType !== "all" ||
    searchQuery.trim() !== "" ||
    fromDate !== undefined ||
    toDate !== undefined;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Employee */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Employee</Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.user_id} value={e.user_id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Activity Type */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Activity Type</Label>
              <Select value={activityType} onValueChange={setActivityType}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="audit">Security</SelectItem>
                  <SelectItem value="edit">Edits</SelectItem>
                  <SelectItem value="session">Sessions</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* From Date */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">From Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !fromDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fromDate ? format(fromDate, "dd MMM yyyy") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fromDate}
                    onSelect={setFromDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* To Date */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">To Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !toDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {toDate ? format(toDate, "dd MMM yyyy") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={toDate}
                    onSelect={setToDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Search */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Name or action..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="mt-3 flex justify-end">
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear Filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Feed */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : activities.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
            No activity found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {activities.map((item) => (
            <Card key={item.id} className="hover:bg-muted/30 transition-colors">
              <CardContent className="py-3 px-4 flex items-start gap-3">
                <div className="pt-0.5">{getTypeBadge(item.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold">{item.employeeName}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-sm font-medium">{item.action}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {item.description}
                  </p>
                  {item.metadata && item.type === "edit" && (
                    <div className="mt-1 flex gap-2 text-[11px]">
                      {item.metadata.old_value && (
                        <span className="text-destructive line-through">
                          {item.metadata.old_value}
                        </span>
                      )}
                      {item.metadata.new_value && (
                        <span className="text-green-600 dark:text-green-400">
                          {item.metadata.new_value}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatTime(item.timestamp)}
                </span>
              </CardContent>
            </Card>
          ))}

          {hasMore && (
            <div className="text-center pt-2">
              <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <ChevronDown className="w-4 h-4 mr-1" />
                )}
                Load More
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Helpers

function getTypeBadge(type: ActivityItem["type"]) {
  switch (type) {
    case "audit":
      return (
        <Badge variant="outline" className="text-[10px]">
          <Shield className="w-3 h-3 mr-1" />
          Security
        </Badge>
      );
    case "edit":
      return (
        <Badge variant="secondary" className="text-[10px]">
          <FileEdit className="w-3 h-3 mr-1" />
          Edit
        </Badge>
      );
    case "session":
      return (
        <Badge variant="secondary" className="text-[10px] bg-muted">
          <Clock className="w-3 h-3 mr-1" />
          Session
        </Badge>
      );
  }
}

function formatAction(action: string) {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTableName(table: string) {
  return table
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAuditDescription(action: string, details: Record<string, any> | null) {
  if (!details) return action.replace(/_/g, " ");
  if (details.role)
    return `Role: ${details.role}${details.user_name ? ` for ${details.user_name}` : ""}`;
  if (details.method) return `Method: ${details.method}`;
  if (details.deleted_user) return `Deleted user: ${details.deleted_user}`;
  return action.replace(/_/g, " ");
}

function formatTime(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default AdminEmployeeActivity;
