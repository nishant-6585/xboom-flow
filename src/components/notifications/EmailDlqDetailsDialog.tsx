import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, RefreshCw, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Shape of a single event object stored in notifications.metadata by
// process-email-queue.notifyDlqBatch. Kept loose because it may include
// forward-compatible fields we don't render yet.
export interface EmailDlqEvent {
  queue?: string;
  template?: string;
  template_label?: string;
  recipient?: string;
  recipient_masked?: string;
  reason?: string;
  reason_raw?: string;
  reason_bucket?: string;
  attempts?: number | null;
  message_id?: string | null;
  idempotency_key?: string | null;
  order_id?: string | null;
  order_number?: string | null;
  customer_name?: string | null;
  sales_person_name?: string | null;
  payload?: Record<string, unknown>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notificationId: string;
  metadata: Record<string, unknown> | null | undefined;
}

export function EmailDlqDetailsDialog({ open, onOpenChange, notificationId, metadata }: Props) {
  const navigate = useNavigate();
  const events = (metadata?.events as EmailDlqEvent[] | undefined) ?? [];
  const runAt = metadata?.run_at as string | undefined;
  const [resending, setResending] = useState<number | null>(null);

  const handleResend = async (idx: number) => {
    setResending(idx);
    try {
      const { data, error } = await supabase.functions.invoke('resend-dlq-email', {
        body: { notification_id: notificationId, event_index: idx },
      });
      if (error) throw error;
      if ((data as { ok?: boolean })?.ok) {
        toast.success('Email re-queued for delivery');
      } else {
        toast.error('Resend failed', {
          description: (data as { error?: string })?.error ?? 'Unknown error',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Resend failed', { description: msg });
    } finally {
      setResending(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email delivery details</DialogTitle>
          <DialogDescription>
            {events.length} email{events.length === 1 ? '' : 's'} dead-lettered
            {runAt ? ` at ${new Date(runAt).toLocaleString()}` : ''}. Payload
            captured from the queue is shown below.
          </DialogDescription>
        </DialogHeader>

        {events.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No detailed payload was captured for this alert.
          </p>
        )}

        <div className="space-y-4">
          {events.map((e, idx) => {
            const canResend = Boolean(
              (e.payload as Record<string, unknown> | undefined)?.html ||
                (e.payload as Record<string, unknown> | undefined)?.text
            );
            return (
              <div key={idx} className="border rounded-lg p-3 space-y-2 bg-muted/30">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {e.template_label || e.template || 'email'}
                  </Badge>
                  {e.order_number && (
                    <Badge variant="outline" className="text-[10px] font-mono">
                      Order #{e.order_number}
                    </Badge>
                  )}
                  {typeof e.attempts === 'number' && e.attempts > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      Attempts: {e.attempts}
                    </Badge>
                  )}
                  {e.queue && (
                    <Badge variant="outline" className="text-[10px]">
                      {e.queue}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Recipient</span>
                  <span className="font-mono">{e.recipient_masked || e.recipient}</span>
                  {e.customer_name && (
                    <>
                      <span className="text-muted-foreground">Customer</span>
                      <span>{e.customer_name}</span>
                    </>
                  )}
                  {e.sales_person_name && (
                    <>
                      <span className="text-muted-foreground">Salesperson</span>
                      <span>{e.sales_person_name}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">Reason</span>
                  <span>{e.reason || e.reason_raw || '—'}</span>
                  {e.message_id && (
                    <>
                      <span className="text-muted-foreground">Message ID</span>
                      <span className="font-mono break-all">{e.message_id}</span>
                    </>
                  )}
                  {e.idempotency_key && (
                    <>
                      <span className="text-muted-foreground">Idempotency</span>
                      <span className="font-mono break-all">{e.idempotency_key}</span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs"
                    disabled={!canResend || resending !== null}
                    onClick={() => handleResend(idx)}
                    title={
                      canResend
                        ? 'Push the exact same email back onto the queue'
                        : 'Original body no longer available — resend from the order'
                    }
                  >
                    {resending === idx ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3 mr-1" />
                    )}
                    Resend email
                  </Button>
                  {e.order_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        onOpenChange(false);
                        navigate(`/orders?order_id=${e.order_id}`);
                      }}
                    >
                      Open order
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </Button>
                  )}
                  {e.message_id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => {
                        onOpenChange(false);
                        navigate(`/admin/kyc-emails?message_id=${e.message_id}`);
                      }}
                    >
                      View email log
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
