import { BUCKET_META, type Bucket } from '@/lib/companyBuckets';
import { cn } from '@/lib/utils';

interface Props {
  bucket: Bucket;
  showLabel?: boolean;
  className?: string;
}

/**
 * Circular ABC marker — A (green/high), B (amber/mid), C (slate/low).
 * Pure SVG so it renders as a crisp typographic icon.
 */
export function CompanyBucketBadge({ bucket, showLabel = false, className }: Props) {
  const meta = BUCKET_META[bucket];
  return (
    <div className={cn('inline-flex items-center gap-1.5', className)} title={`Bucket ${bucket} — ${meta.label}`}>
      <span
        className={cn(
          'inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold shadow-sm',
          meta.badgeClass
        )}
      >
        {bucket}
      </span>
      {showLabel && (
        <span className="text-xs text-muted-foreground">{meta.label}</span>
      )}
    </div>
  );
}