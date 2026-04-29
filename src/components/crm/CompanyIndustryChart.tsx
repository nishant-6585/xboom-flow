import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Factory, Search, BarChart3, PieChart as PieIcon } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import type { Company } from '@/hooks/useCompanies';
import { cn } from '@/lib/utils';

const PALETTE = [
  'hsl(217, 91%, 60%)',
  'hsl(142, 76%, 36%)',
  'hsl(38, 92%, 50%)',
  'hsl(262, 83%, 58%)',
  'hsl(0, 84%, 60%)',
  'hsl(187, 71%, 45%)',
  'hsl(330, 81%, 60%)',
  'hsl(48, 96%, 53%)',
  'hsl(165, 70%, 40%)',
  'hsl(280, 65%, 55%)',
];

type Mode = 'bar' | 'pie';

interface Props {
  companies: Company[];
  onCompanyClick?: (c: Company) => void;
}

export function CompanyIndustryChart({ companies, onCompanyClick }: Props) {
  const [mode, setMode] = useState<Mode>('bar');
  const [openIndustry, setOpenIndustry] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    const map = new Map<string, { count: number; value: number; customers: number; leads: number }>();
    companies.forEach((c) => {
      const key = (c.industry || 'Unknown').trim() || 'Unknown';
      const slot = map.get(key) || { count: 0, value: 0, customers: 0, leads: 0 };
      slot.count += 1;
      slot.value += c.total_order_value || 0;
      if (c.status === 'customer') slot.customers += 1;
      else slot.leads += 1;
      map.set(key, slot);
    });
    return Array.from(map.entries())
      .map(([name, v], i) => ({
        name,
        count: v.count,
        customers: v.customers,
        leads: v.leads,
        value: Math.round(v.value),
        valueK: Math.round(v.value / 1000),
        fill: PALETTE[i % PALETTE.length],
      }))
      .sort((a, b) => b.count - a.count);
  }, [companies]);

  const top = useMemo(() => data.slice(0, 10), [data]);
  const total = companies.length;

  const dialogList = useMemo(() => {
    if (!openIndustry) return [];
    const list = companies.filter((c) =>
      ((c.industry || 'Unknown').trim() || 'Unknown') === openIndustry
    );
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((c) =>
      [c.name, c.city, c.email, c.phone].some(
        (v) => typeof v === 'string' && v.toLowerCase().includes(q)
      )
    );
  }, [openIndustry, companies, search]);

  if (data.length === 0) return null;

  return (
    <>
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Factory className="h-4 w-4 text-primary" />
              Industry Distribution
              <Badge variant="outline" className="text-[10px] ml-1">
                {data.length} industries · {total} companies
              </Badge>
            </CardTitle>
            <div className="flex gap-1 rounded-md border border-border/50 p-0.5">
              <button
                onClick={() => setMode('bar')}
                className={cn(
                  'px-2 py-1 text-[10px] rounded flex items-center gap-1 transition-colors',
                  mode === 'bar' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
                )}
              >
                <BarChart3 className="h-3 w-3" />Bar
              </button>
              <button
                onClick={() => setMode('pie')}
                className={cn(
                  'px-2 py-1 text-[10px] rounded flex items-center gap-1 transition-colors',
                  mode === 'pie' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
                )}
              >
                <PieIcon className="h-3 w-3" />Pie
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={Math.max(260, top.length * 28)}>
            {mode === 'bar' ? (
              <BarChart data={top} layout="vertical" margin={{ left: 0, right: 16, top: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                  formatter={(v: number, key: string) => {
                    if (key === 'count') return [v, 'Companies'];
                    if (key === 'customers') return [v, 'Customers'];
                    if (key === 'leads') return [v, 'Leads'];
                    return [v, key];
                  }}
                  labelFormatter={(name) => {
                    const row = top.find((r) => r.name === name);
                    return `${name} · ₹${((row?.value ?? 0) / 100000).toFixed(1)}L revenue`;
                  }}
                />
                <Bar
                  dataKey="customers"
                  stackId="s"
                  fill="hsl(142, 76%, 36%)"
                  radius={[0, 0, 0, 0]}
                  onClick={(d: any) => { setSearch(''); setOpenIndustry(d.name); }}
                  style={{ cursor: 'pointer' }}
                />
                <Bar
                  dataKey="leads"
                  stackId="s"
                  fill="hsl(217, 91%, 60%)"
                  radius={[0, 4, 4, 0]}
                  onClick={(d: any) => { setSearch(''); setOpenIndustry(d.name); }}
                  style={{ cursor: 'pointer' }}
                />
              </BarChart>
            ) : (
              <PieChart>
                <Pie
                  data={top}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={2}
                  onClick={(d: any) => { setSearch(''); setOpenIndustry(d.name); }}
                  style={{ cursor: 'pointer' }}
                  label={(e: any) => `${e.name} (${e.count})`}
                  labelLine={false}
                >
                  {top.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                  formatter={(v: number, _k, p: any) => {
                    const row = top.find((r) => r.name === p?.payload?.name);
                    return [`${v} companies (${row?.customers ?? 0} customers · ${row?.leads ?? 0} leads)`, p?.payload?.name];
                  }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
              </PieChart>
            )}
          </ResponsiveContainer>

          {data.length > top.length && (
            <div className="text-[10px] text-muted-foreground mt-1 text-center">
              Showing top {top.length} of {data.length} industries
            </div>
          )}
          <div className="text-[10px] text-muted-foreground mt-2 text-center">
            Click any bar / slice to view companies in that industry
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!openIndustry} onOpenChange={(o) => !o && setOpenIndustry(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Factory className="h-4 w-4 text-primary" />
              {openIndustry}
              <Badge variant="outline" className="text-[10px]">{dialogList.length}</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search within industry..."
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
                  onClick={() => { onCompanyClick?.(c); setOpenIndustry(null); }}
                  className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {[c.city, c.email].filter(Boolean).join(' · ') || '—'}
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
                      <span className="text-[11px] text-muted-foreground">
                        ₹{((c.total_order_value || 0) / 100000).toFixed(1)}L
                      </span>
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