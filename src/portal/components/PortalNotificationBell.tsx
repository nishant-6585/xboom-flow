import { useNavigate } from "react-router-dom";
import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePortalNotifications } from "@/portal/hooks/usePortalNotifications";

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * Customer-facing notification bell for the portal — tells them when support
 * replies or a ticket's status changes, so they don't have to reopen the
 * thread to find out.
 */
export function PortalNotificationBell() {
  const { notifications, unreadCount, markRead } = usePortalNotifications();
  const navigate = useNavigate();

  function open(n: (typeof notifications)[number]) {
    if (!n.is_read) markRead.mutate([n.id]);
    if (n.portal_ticket_id) navigate(`/portal/tickets/${n.portal_ticket_id}`);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
          }
          data-testid="portal-notification-bell"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-medium">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => markRead.mutate(null)}
              disabled={markRead.isPending}
            >
              <Check className="h-3 w-3 mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted-foreground text-center">
              Nothing yet. We'll let you know when support replies.
            </p>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => open(n)}
                    className={`w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors ${
                      n.is_read ? "" : "bg-primary/5"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.is_read && (
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      )}
                      <div className={`min-w-0 ${n.is_read ? "pl-3.5" : ""}`}>
                        <div className="text-sm font-medium truncate">{n.title}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2">
                          {n.message}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {timeAgo(n.created_at)}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}