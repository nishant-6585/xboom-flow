import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BUCKET_META, bucketStats, classifyCompanies } from '@/lib/companyBuckets';
import type { Company } from '@/hooks/useCompanies';
import { Layers } from 'lucide-react';

interface Props { companies: Company[] }

export function CompanyBucketAnalysis({ companies }: Props) {
  const { stats, totalValue } = useMemo(() => {
    const cls = classifyCompanies(companies);
    return {
      stats: bucketStats(companies, cls),
      totalValue: companies.reduce((s, c) => s + (c.total_order_value || 0), 0),
    };
  }, [companies]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          ABC Bucket Analysis
          <span className="text-xs font-normal text-muted-foreground ml-2">
            Pareto split by total order value · 70 / 20 / 10
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Stacked bar — share of revenue */}
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">Revenue contribution</div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
            {stats.map(s => (
              <div
                key={s.bucket}
                style={{ width: `${s.valuePct}%`, background: BUCKET_META[s.bucket].color }}
                title={`Bucket ${s.bucket}: ₹${(s.value / 100000).toFixed(1)}L (${s.valuePct.toFixed(1)}%)`}
              />
            ))}
          </div>
        </div>

        {/* Bucket cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {stats.map(s => {
            const meta = BUCKET_META[s.bucket];
            return (
              <div
                key={s.bucket}
                className="rounded-lg border border-border/50 p-4 bg-gradient-to-br from-background to-muted/20"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-base font-bold ${meta.badgeClass}`}
                    >
                      {s.bucket}
                    </span>
                    <div>
                      <div className="text-sm font-semibold">Bucket {s.bucket}</div>
                      <div className="text-[11px] text-muted-foreground">{meta.label}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold">{s.count}</div>
                    <div className="text-[10px] text-muted-foreground">companies</div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Revenue</span>
                    <span className="font-medium">₹{(s.value / 100000).toFixed(1)}L</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${s.valuePct}%`, background: meta.color }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{s.valuePct.toFixed(1)}% of value</span>
                    <span>{s.countPct.toFixed(1)}% of count</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-[11px] text-muted-foreground">
          Total tracked value: <span className="font-medium text-foreground">₹{(totalValue / 100000).toFixed(1)}L</span>
          {' · '}A = top revenue contributors, C = long tail / no-order accounts.
        </div>
      </CardContent>
    </Card>
  );
}