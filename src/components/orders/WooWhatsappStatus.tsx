import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, RefreshCw } from 'lucide-react';
import { useLatestWhatsappNotification } from '@/hooks/useOrderNotification';

interface Props {
  wooOrderId: string;
  /** Stop card click handlers when interacting with the retry button */
  stopPropagation?: boolean;
}

const ICON: Record<string, string> = {
  pending: '⏳',
  sent: '✅',
  failed: '❌',
};

const LABEL: Record<string, string> = {
  pending: 'Queued',
  sent: 'Sent',
  failed: 'Failed',
};

export function WooWhatsappStatus({ wooOrderId, stopPropagation = true }: Props) {
  const { notification, retrying, retry } = useLatestWhatsappNotification(wooOrderId);

  // No notification was ever queued for this order — show nothing.
  if (!notification) return null;

  const status = notification.status;
  const tooltipParts: string[] = [
    `WhatsApp ${LABEL[status]} (${notification.status_trigger})`,
  ];
  if (notification.retry_count > 0) {
    tooltipParts.push(`${notification.retry_count} retries`);
  }
  if (notification.error_message) {
    tooltipParts.push(notification.error_message);
  }

  const stop = (e: React.SyntheticEvent) => {
    if (stopPropagation) e.stopPropagation();
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-1.5" onClick={stop} onPointerDown={stop}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <span aria-hidden>{ICON[status]}</span>
              <span>WhatsApp</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>{tooltipParts.join(' · ')}</TooltipContent>
        </Tooltip>
        {status === 'failed' && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px] gap-1"
            disabled={retrying}
            onClick={retry}
          >
            {retrying ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <RefreshCw className="h-3 w-3" /> Retry
              </>
            )}
          </Button>
        )}
      </div>
    </TooltipProvider>
  );
}