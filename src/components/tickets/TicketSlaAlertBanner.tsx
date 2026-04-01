import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTicketSlaAlerts, useAcknowledgeSlaAlert, TicketSlaAlert } from "@/hooks/useTicketAi";
import { useAuth } from "@/hooks/useAuth";
import { AlertTriangle, Check, Loader2 } from "lucide-react";

interface TicketSlaAlertBannerProps {
  ticketId?: string;
  ticketIds?: string[];
  compact?: boolean;
}

export function TicketSlaAlertBanner({ ticketId, ticketIds, compact }: TicketSlaAlertBannerProps) {
  const { role } = useAuth();
  const ids = ticketId ? [ticketId] : ticketIds;
  const { data: alerts = [] } = useTicketSlaAlerts(ids);
  const acknowledge = useAcknowledgeSlaAlert();

  const canAcknowledge = role === "admin" || role === "hr";

  if (alerts.length === 0) return null;

  if (compact) {
    return (
      <Badge variant="destructive" className="text-xs gap-1">
        <AlertTriangle className="w-3 h-3" />
        {alerts.length} SLA Alert{alerts.length > 1 ? "s" : ""}
      </Badge>
    );
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="flex items-start gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5"
        >
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm">{alert.alert_message}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(alert.notified_at).toLocaleString()}
            </p>
          </div>
          {canAcknowledge && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs shrink-0"
              onClick={() => acknowledge.mutate(alert.id)}
              disabled={acknowledge.isPending}
            >
              {acknowledge.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <Check className="w-3 h-3 mr-1" />
              )}
              Acknowledge
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
