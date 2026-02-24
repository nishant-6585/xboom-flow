import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Activity, Shield, FileEdit, Clock, ChevronDown } from "lucide-react";

interface ActivityItem {
  id: string;
  type: "audit" | "edit" | "session";
  action: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

const PAGE_SIZE = 20;

const MyActivity = () => {
  const { user } = useAuth();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const fetchActivities = useCallback(async (pageNum: number, append = false) => {
    if (!user) return;
    const offset = pageNum * PAGE_SIZE;

    try {
      // Fetch from all 3 sources in parallel
      const [auditRes, editRes, sessionRes] = await Promise.all([
        supabase
          .from("security_audit_log")
          .select("id, action, details, performed_at")
          .eq("user_id", user.id)
          .order("performed_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1),
        supabase
          .from("edit_history")
          .select("id, table_name, field_name, old_value, new_value, edited_at")
          .eq("edited_by", user.id)
          .order("edited_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1),
        supabase
          .from("user_activity_logs")
          .select("id, session_start, session_end, duration_minutes, pages_visited, actions_performed")
          .eq("user_id", user.id)
          .order("session_start", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1),
      ]);

      const items: ActivityItem[] = [];

      // Map audit logs
      (auditRes.data || []).forEach((a) => {
        const details = a.details as Record<string, any> | null;
        items.push({
          id: `audit-${a.id}`,
          type: "audit",
          action: formatAction(a.action),
          description: formatAuditDescription(a.action, details),
          timestamp: a.performed_at,
          metadata: details || undefined,
        });
      });

      // Map edit history — filter out system-only events
      (editRes.data || []).forEach((e) => {
        items.push({
          id: `edit-${e.id}`,
          type: "edit",
          action: `Edited ${formatTableName(e.table_name)}`,
          description: `Changed "${e.field_name}" from "${e.old_value || "—"}" to "${e.new_value || "—"}"`,
          timestamp: e.edited_at,
        });
      });

      // Map sessions
      (sessionRes.data || []).forEach((s) => {
        items.push({
          id: `session-${s.id}`,
          type: "session",
          action: "App Session",
          description: `${s.duration_minutes || 0} min · ${s.pages_visited || 0} pages · ${s.actions_performed || 0} actions`,
          timestamp: s.session_start,
        });
      });

      // Sort by timestamp descending
      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Determine if there's more
      const totalFetched = (auditRes.data?.length || 0) + (editRes.data?.length || 0) + (sessionRes.data?.length || 0);
      setHasMore(totalFetched >= PAGE_SIZE);

      if (append) {
        setActivities((prev) => [...prev, ...items]);
      } else {
        setActivities(items);
      }
    } catch (err) {
      console.error("Error fetching activity:", err);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchActivities(0).then(() => setLoading(false));
    }
  }, [user, fetchActivities]);

  const loadMore = async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    setPage(nextPage);
    await fetchActivities(nextPage, true);
    setLoadingMore(false);
  };

  const formatAction = (action: string) => {
    return action
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const formatTableName = (table: string) => {
    return table
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const formatAuditDescription = (action: string, details: Record<string, any> | null) => {
    if (!details) return action.replace(/_/g, " ");
    if (details.role) return `Role: ${details.role}${details.user_name ? ` for ${details.user_name}` : ""}`;
    if (details.method) return `Method: ${details.method}`;
    if (details.deleted_user) return `Deleted user: ${details.deleted_user}`;
    return action.replace(/_/g, " ");
  };

  const getTypeBadge = (type: ActivityItem["type"]) => {
    switch (type) {
      case "audit":
        return <Badge variant="outline" className="text-[10px]"><Shield className="w-3 h-3 mr-1" />Security</Badge>;
      case "edit":
        return <Badge variant="secondary" className="text-[10px]"><FileEdit className="w-3 h-3 mr-1" />Edit</Badge>;
      case "session":
        return <Badge variant="secondary" className="text-[10px] bg-muted"><Clock className="w-3 h-3 mr-1" />Session</Badge>;
    }
  };

  const formatTime = (ts: string) => {
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
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Activity className="w-6 h-6" /> My Activity
        </h1>

        {activities.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No activity recorded yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {activities.map((item) => (
              <Card key={item.id} className="hover:bg-muted/30 transition-colors">
                <CardContent className="py-3 px-4 flex items-start gap-3">
                  <div className="pt-0.5">{getTypeBadge(item.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.action}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{formatTime(item.timestamp)}</span>
                </CardContent>
              </Card>
            ))}

            {hasMore && (
              <div className="text-center pt-2">
                <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
                  Load More
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default MyActivity;
