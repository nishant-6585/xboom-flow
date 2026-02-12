import { format } from "date-fns";
import { Bell, AlertTriangle, AlertCircle, Info, MoreVertical, Trash2, Edit, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Notice, NoticeVisibility } from "@/hooks/useNotices";

interface NoticeCardProps {
  notice: Notice;
  isRead?: boolean;
  isAdmin?: boolean;
  onEdit?: (notice: Notice) => void;
  onDelete?: (id: string) => void;
  onToggleActive?: (id: string, active: boolean) => void;
  onMarkRead?: (id: string) => void;
  compact?: boolean;
}

const priorityConfig = {
  low: { icon: Info, color: "text-muted-foreground", bg: "bg-muted" },
  normal: { icon: Bell, color: "text-primary", bg: "bg-primary/10" },
  high: { icon: AlertCircle, color: "text-warning", bg: "bg-warning/10" },
  urgent: { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
};

const visibilityLabels: Record<NoticeVisibility, string> = {
  all: "Everyone",
  sales: "Sales",
  supply_chain: "Supply Chain",
  finance: "Finance",
  admin: "Admin",
  it: "IT",
  marketing: "Marketing",
  hr: "HR",
};

export function NoticeCard({
  notice,
  isRead = false,
  isAdmin = false,
  onEdit,
  onDelete,
  onToggleActive,
  onMarkRead,
  compact = false,
}: NoticeCardProps) {
  const config = priorityConfig[notice.priority];
  const PriorityIcon = config.icon;

  if (compact) {
    return (
      <div
        className={`p-3 rounded-lg border transition-colors cursor-pointer ${
          isRead ? "bg-muted/30 border-border" : "bg-background border-primary/30"
        }`}
        onClick={() => onMarkRead?.(notice.id)}
      >
        <div className="flex items-start gap-2">
          <div className={`p-1.5 rounded-full ${config.bg} shrink-0`}>
            <PriorityIcon className={`w-3.5 h-3.5 ${config.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className={`font-medium text-sm truncate ${isRead ? "text-muted-foreground" : ""}`}>
                {notice.title}
              </h4>
              {!isRead && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                  New
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {format(new Date(notice.created_at), "dd MMM, h:mm a")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className={`transition-all ${!isRead && !isAdmin ? "ring-1 ring-primary/30" : ""}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-full ${config.bg}`}>
              <PriorityIcon className={`w-4 h-4 ${config.color}`} />
            </div>
            <div>
              <h3 className="font-semibold">{notice.title}</h3>
              <p className="text-xs text-muted-foreground">
                By {notice.created_by_name} • {format(new Date(notice.created_at), "dd MMM yyyy, h:mm a")}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <Badge variant={notice.priority === "urgent" ? "destructive" : "secondary"} className="text-xs">
              {notice.priority}
            </Badge>
            {!notice.is_active && (
              <Badge variant="outline" className="text-xs">Inactive</Badge>
            )}
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit?.(notice)}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onToggleActive?.(notice.id, !notice.is_active)}>
                    {notice.is_active ? (
                      <>
                        <EyeOff className="w-4 h-4 mr-2" />
                        Deactivate
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4 mr-2" />
                        Activate
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => onDelete?.(notice.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm whitespace-pre-wrap">{notice.content}</p>
        
        <div className="flex flex-wrap gap-1 mt-3">
          {notice.visibility.map((v) => (
            <Badge key={v} variant="outline" className="text-xs">
              {visibilityLabels[v]}
            </Badge>
          ))}
        </div>
        
        {notice.expires_at && (
          <p className="text-xs text-muted-foreground mt-2">
            Expires: {format(new Date(notice.expires_at), "dd MMM yyyy")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
