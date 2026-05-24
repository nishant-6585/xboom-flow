import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PaymentModeBadge } from '@/components/PaymentModeBadge';
import { getPaymentModeBadgeClass, getPaymentModeLabel } from '@/lib/paymentModes';
import { IndianRupee } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MinimalPaymentRecord {
  amount: number;
  status: string;
  payment_mode?: string | null;
}

interface PaymentModeBreakdownCardProps {
  paymentRecords: MinimalPaymentRecord[];
  title?: string;
  periodLabel?: string;
  className?: string;
}

export function PaymentModeBreakdownCard({
  paymentRecords,
  title = 'Received by Payment Mode',
  periodLabel,
  className,
}: PaymentModeBreakdownCardProps) {
  const { rows, total } = useMemo(() => {
    const approved = paymentRecords.filter((r) => r.status === 'approved');
    const byMode = new Map<string, { amount: number; count: number }>();
    approved.forEach((r) => {
      const key = r.payment_mode ?? 'unknown';
      const cur = byMode.get(key) ?? { amount: 0, count: 0 };
      cur.amount += Number(r.amount) || 0;
      cur.count += 1;
      byMode.set(key, cur);
    });
    const total = Array.from(byMode.values()).reduce((s, v) => s + v.amount, 0);
    const rows = Array.from(byMode.entries())
      .map(([mode, v]) => ({
        mode,
        amount: v.amount,
        count: v.count,
        pct: total > 0 ? (v.amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
    return { rows, total };
  }, [paymentRecords]);

  return (
    <Card className={cn('glass', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <IndianRupee className="h-4 w-4 text-primary" />
            {title}
          </CardTitle>
          {periodLabel && (
            <span className="text-xs text-muted-foreground">{periodLabel}</span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No approved payments in this period.
          </p>
        ) : (
          <>
            {/* Stacked bar */}
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted mb-4">
              {rows.map((r) => (
                <div
                  key={r.mode}
                  className={cn('h-full border-r border-background', getPaymentModeBadgeClass(r.mode))}
                  style={{ width: `${r.pct}%` }}
                  title={`${getPaymentModeLabel(r.mode)} · ${r.pct.toFixed(1)}%`}
                />
              ))}
            </div>
            {/* Rows */}
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.mode} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <PaymentModeBadge mode={r.mode === 'unknown' ? null : r.mode} short />
                    <span className="text-xs text-muted-foreground truncate">
                      {r.count} {r.count === 1 ? 'payment' : 'payments'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-medium">₹{r.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                    <span className="text-xs text-muted-foreground w-12 text-right">{r.pct.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
              <div className="border-t border-border pt-2 mt-2 flex items-center justify-between text-sm font-semibold">
                <span>Total Received</span>
                <span>₹{total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}