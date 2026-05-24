import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getPaymentModeBadgeClass, getPaymentModeLabel, PAYMENT_MODES } from '@/lib/paymentModes';

interface PaymentModeBadgeProps {
  mode: string | null | undefined;
  short?: boolean;
  className?: string;
}

export function PaymentModeBadge({ mode, short, className }: PaymentModeBadgeProps) {
  if (!mode) {
    return (
      <Badge variant="outline" className={cn('text-[10px]', className)}>
        Unknown
      </Badge>
    );
  }
  const def = PAYMENT_MODES.find((m) => m.value === mode);
  const label = short && def ? def.shortLabel : getPaymentModeLabel(mode);
  return (
    <Badge className={cn('text-[10px] border', getPaymentModeBadgeClass(mode), className)}>
      {label}
    </Badge>
  );
}