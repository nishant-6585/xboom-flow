import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Building2, Search, Target, GitBranch, Layers, CircleDashed } from 'lucide-react';
import type { Company } from '@/hooks/useCompanies';
import { useCompanyEngagementMap, type EngagementBucket } from '@/hooks/useCompanyEngagement';
import { cn } from '@/lib/utils';

interface Props {
  companies: Company[];
  onCompanyClick?: (company: Company) => void;
}

const BUCKET_META: Record<EngagementBucket, { label: string; icon: any; tone: string; ring: string; bg: string }> = {
  prospect: { label: 'In Prospects only', icon: Target,
    tone: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-500/30', bg: 'bg-amber-500/10' },
  pipeline: { label: 'In Pipeline only', icon: GitBranch,
    tone: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-500/30', bg: 'bg-blue-500/10' },
  both: { label: 'In Both', icon: Layers,
    tone: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-500/30', bg: 'bg-emerald-500/10' },
  none: { label: 'Not Engaged', icon: CircleDashed,
    tone: 'text-muted-foreground', ring: 'ring-border', bg: 'bg-muted/30' },
};

export function CompanyEngagementCard({ companies, onCompanyClick }: Props) {
  const { counts, ids, values, loading } = useCompanyEngagementMap(companies);
  const [openBucket, setOpenBucket] = useState<EngagementBucket | null>(null);
  const [search, setSearch] = useState('');

  const total = companies.length;
  const fmtINR = (v: number) => {
    if (!v) return null;
    if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
    if (v >= 100000) return `₹${(v / 100000).toFixed(2)} L`;
    if (v >= 1000) return `₹${(v / 1000).toFixed(1)} K`;
    return `₹${Math.round(v)}`;
  };
  const tiles: { bucket: EngagementBucket; count: number; value: number | null }[] = [
    { bucket: 'prospect', count: counts.prospect, value: values.prospect },
    { bucket: 'pipeline', count: counts.pipeline, value: values.pipeline },
    { bucket: 'both', count: counts.both, value: values.both },
    { bucket: 'none', count: counts.none, value: null },
  ];

  const dialogList = useMemo(() => {
    if (!openBucket) return [];
    const idSet = ids[openBucket];
    const list = companies.filter((c) => idSet.has(c.id));
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((c) =>
      [c.name, c.city, c.industry, c.email, c.phone]
        .some((v) => typeof v === 'string' && v.toLowerCase().includes(q))
    );
  }, [openBucket, ids, companies, search]);

  return (
    <>
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Engagement Coverage
            <Badge variant="outline" className="text-[10px] ml-1">
              {counts.engagedTotal}/{total} engaged
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {tiles.map(({ bucket, count, value }) => {
            const meta = BUCKET_META[bucket];
            const Icon = meta.icon;
            const pct = total ? Math.round((count / total) * 100) : 0;
            const valueLabel = value != null ? fmtINR(value) : null;
            return (
              <button
                key={bucket}
                type="button"
                onClick={() => { setSearch(''); setOpenBucket(bucket); }}
                disabled={loading || count === 0}
                className={cn(
                  'group text-left rounded-lg border border-border/50 p-3 transition-all',
                  'hover:ring-2 hover:-translate-y-0.5 hover:shadow-md',
                  meta.ring,
                  count === 0 && 'opacity-60 cursor-not-allowed hover:translate-y-0 hover:shadow-none hover:ring-0'
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn('p-1.5 rounded-md', meta.bg)}>
                    <Icon className={cn('h-3.5 w-3.5', meta.tone)} />
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground">{meta.label}</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className={cn('text-2xl font-bold', meta.tone)}>{count}</span>
                  <span className="text-[10px] text-muted-foreground">· {pct}%</span>
                </div>
                {valueLabel && (
                  <div className={cn('text-[11px] font-semibold mt-1', meta.tone)}>
                    {valueLabel} <span className="text-[9px] text-muted-foreground font-normal">open value</span>
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground/80 mt-0.5 group-hover:text-foreground transition-colors">
                  {count > 0 ? 'Click to view companies →' : 'No companies'}
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={!!openBucket} onOpenChange={(o) => !o && setOpenBucket(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {openBucket && (() => {
                const Icon = BUCKET_META[openBucket].icon;
                return <Icon className={cn('h-4 w-4', BUCKET_META[openBucket].tone)} />;
              })()}
              {openBucket ? BUCKET_META[openBucket].label : ''}
              <Badge variant="outline" className="text-[10px]">{dialogList.length}</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search within list..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <div className="max-h-[420px] overflow-y-auto rounded-md border border-border/50 divide-y divide-border/40">
            {dialogList.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No companies</div>
            ) : (
              dialogList.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onCompanyClick?.(c);
                    setOpenBucket(null);
                  }}
                  className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {[c.industry, c.city, c.email].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      className={cn(
                        'text-[10px] border-0',
                        c.status === 'customer'
                          ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                          : 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
                      )}
                    >
                      {c.status}
                    </Badge>
                    {c.total_orders_count > 0 && (
                      <span className="text-[11px] text-muted-foreground">{c.total_orders_count} orders</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}