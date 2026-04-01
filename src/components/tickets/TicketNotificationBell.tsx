import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useTicketNotifications,
  useMarkNotificationRead,
  TicketNotification,
} from "@/hooks/useTicketResolution";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Bot, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

const typeIcons: Record<string, React.ReactNode> = {
  ai_resolution_ready: <Bot className="w-4 h-4 text-violet-500" />,
  resolution_approved: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  resolution_rejected: <XCircle className="w-4 h-4 text-red-500" />,
  ticket_resolved: <CheckCircle2 className="w-4 h-4 text-green-500" />,
};

export function TicketNotificationBell() {
  const { data: notifications = [] } = useTicketNotifications();
  const markRead = useMarkNotificationRead();
  const navigate = useNavigate();

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleClick = (notification: TicketNotification) => {
    if (!notification.read) {
      markRead.mutate(notification.id);
    }
    navigate("/tickets");
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 text-[10px] bg-destructive text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b">
          <h4 className="font-medium text-sm">Ticket Notifications</h4>
          {unreadCount > 0 && (
            <p className="text-xs text-muted-foreground">{unreadCount} unread</p>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            notifications.slice(0, 20).map((n) => (
              <div
                key={n.id}
                className={cn(
                  "p-3 border-b last:border-0 cursor-pointer hover:bg-muted/50 transition-colors",
                  !n.read && "bg-primary/5"
                )}
                onClick={() => handleClick(n)}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 shrink-0">
                    {typeIcons[n.type] || <AlertTriangle className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm line-clamp-2">{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {!n.read && (
                    <span className="w-2 h-2 bg-primary rounded-full shrink-0 mt-1.5" />
                  )}
                </div>
              </div>
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
