// Read-only evidence renderer for approvers (pending queue, order panel, audit
// log). Call-log items show number/date/duration + a "before order" badge when
// the order date is known; file items open via a short-lived signed URL.

import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Phone, FileText, ExternalLink } from 'lucide-react';
import {
  AttributionEvidence,
  EVIDENCE_BUCKET,
  isBeforeOrder,
  formatCallDuration,
  parseEvidence,
} from './attributionEvidence';

async function openFile(path: string) {
  const { data, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(path, 300);
  if (error || !data?.signedUrl) {
    toast({ title: 'Could not open file', description: error?.message, variant: 'destructive' });
    return;
  }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

export function AttributionEvidenceList({
  evidence,
  orderAt,
}: {
  evidence: unknown; // raw jsonb from the row
  orderAt?: string | null; // order_date/created_at for the before/after badge
}) {
  const items: AttributionEvidence[] = parseEvidence(evidence);
  if (!items.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Evidence:
      </span>
      {items.map((e, i) =>
        e.type === 'call_log' ? (
          <Badge
            key={`c-${e.call_log_id}-${i}`}
            variant="outline"
            className="gap-1 text-[10px] font-normal"
          >
            <Phone className="h-3 w-3" />
            {format(new Date(e.called_at), 'dd MMM, HH:mm')} · {formatCallDuration(e.duration)}
            {orderAt && (
              <span className={isBeforeOrder(e.called_at, orderAt) ? 'text-emerald-700' : 'text-amber-700'}>
                · {isBeforeOrder(e.called_at, orderAt) ? 'before order' : 'after order'}
              </span>
            )}
          </Badge>
        ) : (
          <button
            key={`f-${e.path}-${i}`}
            type="button"
            onClick={() => openFile(e.path)}
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] hover:bg-muted"
          >
            <FileText className="h-3 w-3" />
            <span className="max-w-[140px] truncate">{e.name}</span>
            <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
          </button>
        ),
      )}
    </div>
  );
}
