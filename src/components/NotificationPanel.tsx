import { Bell, Check, CheckCheck, AlertTriangle, Clock, CreditCard, Flame, Star, MessageSquare, ClipboardCheck, FileWarning, ArrowRight, Inbox, ShieldAlert, Award, LifeBuoy, RefreshCw, Loader2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Notification, useNotifications } from '@/hooks/useNotifications';
import { PushNotificationToggle } from '@/components/PushNotificationToggle';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { TicketStatusBadge } from '@/portal/components/TicketStatusBadge';
import type { TicketStatus } from '@/portal/hooks/usePortalTickets';
import { EmailDlqDetailsDialog, type EmailDlqEvent } from '@/components/notifications/EmailDlqDetailsDialog';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

interface NotificationPanelProps {
  className?: string;
}

function NotificationItem({
  notification,
  onMarkAsRead,
  ticketStatus,
}: {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  ticketStatus?: TicketStatus | null;
}) {
  const isOverdue = notification.title.toLowerCase().includes('overdue');
  const isDueToday = notification.title.toLowerCase().includes('due today');
  const isHotLead = notification.type === 'hot_lead';
  const isMegaDeal = notification.type === 'mega_deal';
  const isEnquiryResponse = notification.type === 'enquiry_response';
  const isEnquiryMessage = notification.type === 'enquiry_message';
  const isProformaStale = notification.type === 'proforma_stale';
  const isOrderConfirmed = notification.type === 'order_confirmed_by_customer';
  const isEmailDlqAlert = notification.type === 'email_dlq_alert';
  const dlqEvents = (isEmailDlqAlert
    ? ((notification.metadata as { events?: EmailDlqEvent[] } | null | undefined)?.events ?? [])
    : []) as EmailDlqEvent[];
  const singleDlqEvent = dlqEvents.length === 1 ? dlqEvents[0] : null;
  const canResendSingle = Boolean(
    singleDlqEvent &&
      ((singleDlqEvent.payload as Record<string, unknown> | undefined)?.html ||
        (singleDlqEvent.payload as Record<string, unknown> | undefined)?.text)
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [resending, setResending] = useState(false);
  const isAttributionRequest = notification.type === 'attribution_request';
  const isAttributionDecision = notification.type === 'attribution_decision';
  // The decision type doesn't carry the outcome — the RPC titles the row
  // 'Attribution approved' / 'Attribution rejected'.
  const isAttributionApproved =
    isAttributionDecision && notification.title.toLowerCase().includes('approved');
  const isKycNameMismatch = notification.type === 'kyc_name_mismatch';
  const isPortalTicket =
    notification.type === 'portal_ticket_created' ||
    notification.type === 'portal_service_request';
  const navigate = useNavigate();

  const openTicket = () => {
    const id = notification.portal_ticket_id;
    if (!isUuid(id)) {
      toast.error("Can't open ticket", {
        description: 'This notification is missing a valid ticket reference.',
      });
      return;
    }
    if (!notification.is_read) onMarkAsRead(notification.id);
    navigate(`/admin/portal-tickets/${id}`);
  };

  const resendSingle = async () => {
    setResending(true);
    try {
      const { data, error } = await supabase.functions.invoke('resend-dlq-email', {
        body: { notification_id: notification.id, event_index: 0 },
      });
      if (error) throw error;
      if ((data as { ok?: boolean })?.ok) {
        toast.success('Email re-queued for delivery');
        if (!notification.is_read) onMarkAsRead(notification.id);
      } else {
        toast.error('Resend failed', {
          description: (data as { error?: string })?.error ?? 'Unknown error',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Resend failed', { description: msg });
    } finally {
      setResending(false);
    }
  };

  const getIcon = () => {
    if (isHotLead) return <Flame className="w-4 h-4" />;
    if (isMegaDeal) return <Star className="w-4 h-4" />;
    if (isEnquiryResponse) return <ClipboardCheck className="w-4 h-4" />;
    if (isEnquiryMessage) return <MessageSquare className="w-4 h-4" />;
    if (isProformaStale) return <FileWarning className="w-4 h-4" />;
    if (isOrderConfirmed) return <ClipboardCheck className="w-4 h-4" />;
    if (isEmailDlqAlert) return <FileWarning className="w-4 h-4" />;
    if (isAttributionRequest) return <Inbox className="w-4 h-4" />;
    if (isAttributionDecision) return <Award className="w-4 h-4" />;
    if (isKycNameMismatch) return <ShieldAlert className="w-4 h-4" />;
    if (isPortalTicket) return <LifeBuoy className="w-4 h-4" />;
    if (isOverdue) return <AlertTriangle className="w-4 h-4" />;
    if (isDueToday) return <Clock className="w-4 h-4" />;
    return <CreditCard className="w-4 h-4" />;
  };

  const getIconStyle = () => {
    if (isHotLead) return 'bg-orange-500/10 text-orange-500';
    if (isMegaDeal) return 'bg-yellow-500/10 text-yellow-500';
    if (isEnquiryResponse) return 'bg-emerald-500/10 text-emerald-500';
    if (isEnquiryMessage) return 'bg-blue-500/10 text-blue-500';
    if (isProformaStale) return 'bg-amber-500/10 text-amber-600';
    if (isOrderConfirmed) return 'bg-emerald-500/10 text-emerald-600';
    if (isEmailDlqAlert) return 'bg-destructive/10 text-destructive';
    if (isAttributionRequest) return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
    if (isAttributionDecision)
      return isAttributionApproved
        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
        : 'bg-rose-500/10 text-rose-700 dark:text-rose-400';
    if (isKycNameMismatch) return 'bg-rose-500/10 text-rose-700 dark:text-rose-400';
    if (isPortalTicket) return 'bg-sky-500/10 text-sky-700 dark:text-sky-400';
    if (isOverdue) return 'bg-destructive/10 text-destructive';
    if (isDueToday) return 'bg-warning/10 text-warning';
    return 'bg-primary/10 text-primary';
  };

  return (
    <div
      className={cn(
        'p-4 border-b border-border last:border-0 transition-colors',
        !notification.is_read && 'bg-primary/5'
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-lg shrink-0', getIconStyle())}>
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p
              className={cn(
                'font-medium text-sm truncate',
                isOverdue && 'text-destructive',
                isHotLead && 'text-orange-500',
                isMegaDeal && 'text-yellow-600'
              )}
            >
              {notification.title}
            </p>
            {!notification.is_read && (
              <Badge variant="secondary" className="shrink-0 text-xs">
                New
              </Badge>
            )}
          </div>
          {notification.order_number && (
            <div className="mb-1">
              <Badge variant="outline" className="text-[10px] font-mono">
                Order #{notification.order_number}
              </Badge>
            </div>
          )}
          {isPortalTicket && ticketStatus && (
            <div className="mb-1">
              <TicketStatusBadge status={ticketStatus} />
            </div>
          )}
          <p className="text-sm text-muted-foreground line-clamp-2">
            {notification.message}
          </p>
          {isProformaStale && notification.order_id && (
            <div className="mt-2">
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => {
                  if (!notification.is_read) onMarkAsRead(notification.id);
                  navigate(`/proforma-reconciliation?order_id=${notification.order_id}`);
                }}
              >
                Review now
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          )}
          {isOrderConfirmed && notification.order_id && (
            <div className="mt-2">
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => {
                  if (!notification.is_read) onMarkAsRead(notification.id);
                  navigate(`/orders?order_id=${notification.order_id}`);
                }}
              >
                Open order
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          )}
          {isEmailDlqAlert && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                onClick={() => setDetailsOpen(true)}
              >
                <Eye className="w-3 h-3 mr-1" />
                View details
              </Button>
              {singleDlqEvent && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={!canResendSingle || resending}
                  onClick={resendSingle}
                  title={
                    canResendSingle
                      ? 'Push the exact same email back onto the queue'
                      : 'Original body no longer available — resend from the order'
                  }
                >
                  {resending ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3 mr-1" />
                  )}
                  Resend email
                </Button>
              )}
              {singleDlqEvent?.order_id && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    if (!notification.is_read) onMarkAsRead(notification.id);
                    navigate(`/orders?order_id=${singleDlqEvent.order_id}`);
                  }}
                >
                  Open order
                  <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              )}
              <EmailDlqDetailsDialog
                open={detailsOpen}
                onOpenChange={setDetailsOpen}
                notificationId={notification.id}
                metadata={notification.metadata ?? null}
              />
            </div>
          )}
          {isAttributionRequest && (
            <div className="mt-2">
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => {
                  if (!notification.is_read) onMarkAsRead(notification.id);
                  navigate(
                    notification.order_id
                      ? `/orders?order_id=${notification.order_id}`
                      : '/orders?tab=attribution_requests'
                  );
                }}
              >
                View request
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          )}
          {isAttributionDecision && (
            <div className="mt-2">
              <Button
                size="sm"
                variant="default"
                className={cn(
                  'h-7 text-xs text-white',
                  isAttributionApproved
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                )}
                onClick={() => {
                  if (!notification.is_read) onMarkAsRead(notification.id);
                  // Approved → the order is now the rep's own, so the order
                  // dialog is visible to them; rejected → the order stays
                  // RLS-hidden, so send them to their claim-requests list.
                  if (isAttributionApproved && notification.order_id) {
                    navigate(`/orders?order_id=${notification.order_id}`);
                  } else {
                    // Claim Order tab was removed — send reps to their sales
                    // landing so they can review attribution status there.
                    navigate('/sales');
                  }
                }}
              >
                {isAttributionApproved ? 'Open order' : 'View my requests'}
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          )}
          {isKycNameMismatch && (
            <div className="mt-2">
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs bg-rose-600 hover:bg-rose-700 text-white"
                onClick={() => {
                  if (!notification.is_read) onMarkAsRead(notification.id);
                  navigate(
                    notification.account_id
                      ? `/kyc?account=${notification.account_id}`
                      : '/kyc'
                  );
                }}
              >
                View KYC review
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          )}
          {(isEnquiryResponse || isEnquiryMessage) && notification.enquiry_id && (
            <div className="mt-2">
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => {
                  if (!notification.is_read) onMarkAsRead(notification.id);
                  navigate(`/?enquiry=${notification.enquiry_id}`);
                }}
              >
                View enquiry
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          )}
          {isPortalTicket && (
            <div className="mt-2">
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs bg-sky-600 hover:bg-sky-700 text-white"
                onClick={openTicket}
                disabled={!isUuid(notification.portal_ticket_id)}
                title={
                  isUuid(notification.portal_ticket_id)
                    ? undefined
                    : 'Ticket reference unavailable'
                }
              >
                Open ticket
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          )}
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(notification.created_at), {
                addSuffix: true,
              })}
            </span>
            {!notification.is_read && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => onMarkAsRead(notification.id)}
              >
                <Check className="w-3 h-3 mr-1" />
                Mark read
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export function NotificationPanel({ className }: NotificationPanelProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, loading } =
    useNotifications();
  const [ticketStatuses, setTicketStatuses] = useState<Record<string, TicketStatus>>({});

  const ticketIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of notifications) {
      if (
        (n.type === 'portal_ticket_created' || n.type === 'portal_service_request') &&
        isUuid(n.portal_ticket_id)
      ) {
        ids.add(n.portal_ticket_id as string);
      }
    }
    return Array.from(ids);
  }, [notifications]);

  useEffect(() => {
    if (ticketIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const missing = ticketIds.filter((id) => !ticketStatuses[id]);
      if (missing.length === 0) return;
      const { data, error } = await supabase
        .from('portal_tickets')
        .select('id, status')
        .in('id', missing);
      if (error || cancelled || !data) return;
      setTicketStatuses((prev) => {
        const next = { ...prev };
        for (const row of data as { id: string; status: TicketStatus }[]) {
          next[row.id] = row.status;
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketIds, ticketStatuses]);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('relative', className)}>
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <div className="px-6 pt-6 pb-2">
          <SheetHeader>
            <div className="flex items-center gap-3">
              <SheetTitle className="flex items-center gap-2 flex-1">
                <Bell className="w-5 h-5 shrink-0" />
                Notifications
              </SheetTitle>
              {unreadCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={markAllAsRead}
                  className="text-xs shrink-0 mr-6"
                >
                  <CheckCheck className="w-3 h-3 mr-1" />
                  Mark all read
                </Button>
              )}
            </div>
            <SheetDescription>Payment reminders and alerts</SheetDescription>
          </SheetHeader>
          <div className="mt-2">
            <PushNotificationToggle />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-6">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8">
                <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <p className="text-muted-foreground">No notifications</p>
              </div>
            ) : (
              <div className="space-y-0">
                {notifications.map(notification => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={markAsRead}
                    ticketStatus={
                      notification.portal_ticket_id
                        ? ticketStatuses[notification.portal_ticket_id] ?? null
                        : null
                    }
                  />
                ))}
              </div>
            )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
