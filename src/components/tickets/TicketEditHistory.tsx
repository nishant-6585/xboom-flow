import { useEffect, useState } from "react";
import { useEditHistory, EditHistoryRecord } from "@/hooks/useEditHistory";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format, formatDistanceToNow } from "date-fns";
import { History, User, ArrowRight, Loader2, PlusCircle } from "lucide-react";

interface TicketEditHistoryProps {
  ticketId: string;
}

const fieldLabels: Record<string, string> = {
  subject: "Subject",
  description: "Description",
  status: "Status",
  priority: "Priority",
  category: "Category",
  assigned_department: "Department",
  assigned_to: "Assigned To",
  assigned_to_name: "Assigned To",
  resolution_notes: "Resolution Notes",
  sla_due_at: "SLA Due",
  comment: "Comment Added",
  comment_edited: "Comment Edited",
  comment_deleted: "Comment Deleted",
};

const statusLabels: Record<string, string> = {
  open: "Open",
  assigned: "Assigned",
  in_progress: "In Progress",
  pending: "Pending",
  resolved: "Resolved",
  closed: "Closed",
  removed: "Removed",
};

const priorityLabels: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const departmentLabels: Record<string, string> = {
  sales: "Sales",
  supply_chain: "Supply Chain",
  finance: "Finance",
  admin: "Admin",
};

function formatValue(field: string, value: string | null): string {
  if (!value) return "—";
  
  if (field === "status") {
    return statusLabels[value] || value;
  }
  if (field === "priority") {
    return priorityLabels[value] || value;
  }
  if (field === "assigned_department") {
    return departmentLabels[value] || value;
  }
  if (field.includes("_at") || field.includes("date")) {
    try {
      return format(new Date(value), "dd MMM yyyy, HH:mm");
    } catch {
      return value;
    }
  }
  
  return value;
}

export function TicketEditHistory({ ticketId }: TicketEditHistoryProps) {
  const { fetchHistory } = useEditHistory();
  const [history, setHistory] = useState<EditHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createdInfo, setCreatedInfo] = useState<{ created_at: string; created_by_name: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [records] = await Promise.all([
        fetchHistory("tickets", ticketId),
      ]);
      setHistory(records);

      // Fetch ticket creation info
      const { data: ticket } = await supabase
        .from("tickets")
        .select("created_at, raised_by_name")
        .eq("id", ticketId)
        .single();

      if (ticket) {
        setCreatedInfo({ created_at: ticket.created_at, created_by_name: ticket.raised_by_name });
      }

      setLoading(false);
    };
    load();
  }, [ticketId, fetchHistory]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (history.length === 0 && !createdInfo) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No edit history available</p>
      </div>
    );
  }

  // Group history by date
  const groupedHistory = history.reduce((acc, record) => {
    const date = format(new Date(record.edited_at), "yyyy-MM-dd");
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(record);
    return acc;
  }, {} as Record<string, EditHistoryRecord[]>);

  return (
    <ScrollArea className="h-[300px]">
      <div className="space-y-4 pr-4">
        {Object.entries(groupedHistory).map(([date, records]) => (
          <div key={date}>
            <div className="sticky top-0 bg-background py-2">
              <Badge variant="outline" className="text-xs">
                {format(new Date(date), "dd MMMM yyyy")}
              </Badge>
            </div>
            <div className="space-y-3 ml-2 border-l-2 border-muted pl-4">
              {records.map((record) => (
                <div
                  key={record.id}
                  className="relative before:absolute before:-left-[22px] before:top-2 before:w-3 before:h-3 before:rounded-full before:bg-primary/20 before:border-2 before:border-primary"
                >
                  <div className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <User className="w-3 h-3" />
                        <span className="font-medium text-foreground">
                          {record.edited_by_name}
                        </span>
                        <span>•</span>
                        <span>
                          {formatDistanceToNow(new Date(record.edited_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 text-sm">
                      <span className="text-muted-foreground text-xs uppercase tracking-wide">
                        {fieldLabels[record.field_name] || record.field_name}
                      </span>
                      {record.field_name === "comment" ? (
                        <div className="bg-background/60 p-2 rounded text-sm italic">
                          "{record.new_value}"
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-muted-foreground line-through">
                            {formatValue(record.field_name, record.old_value)}
                          </span>
                          <ArrowRight className="w-4 h-4 text-primary" />
                          <span className="font-medium">
                            {formatValue(record.field_name, record.new_value)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {createdInfo && (
          <div>
            <div className="sticky top-0 bg-background py-2">
              <Badge variant="outline" className="text-xs">
                {format(new Date(createdInfo.created_at), "dd MMMM yyyy")}
              </Badge>
            </div>
            <div className="space-y-3 ml-2 border-l-2 border-muted pl-4">
              <div className="relative before:absolute before:-left-[22px] before:top-2 before:w-3 before:h-3 before:rounded-full before:bg-green-500/20 before:border-2 before:border-green-500">
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <PlusCircle className="w-3 h-3 text-green-500" />
                      <span className="font-medium text-foreground">
                        {createdInfo.created_by_name}
                      </span>
                      <span>•</span>
                      <span>
                        {formatDistanceToNow(new Date(createdInfo.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <div className="text-sm font-medium text-green-600 dark:text-green-400">
                    Ticket Created
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
