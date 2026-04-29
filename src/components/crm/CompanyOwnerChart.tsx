import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Users, Search } from 'lucide-react';
import { Company } from '@/hooks/useCompanies';
import { useProfileNames } from '@/hooks/useProfileNames';
import { Badge } from '@/components/ui/badge';

interface Props {
  companies: Company[];
  onCompanyClick?: (c: Company) => void;
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(217 91% 60%)',
  'hsl(142 71% 45%)',
  'hsl(38 92% 50%)',
  'hsl(271 91% 65%)',
  'hsl(0 84% 60%)',
  'hsl(189 94% 43%)',
  'hsl(322 81% 60%)',
];

export function CompanyOwnerChart({ companies, onCompanyClick }: Props) {
  const { resolveName, isLoading } = useProfileNames();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    const map = new Map<string, { ownerId: string | null; name: string; total: number; customers: number; leads: number }>();
    companies.forEach((c) => {
      const ownerId = c.account_owner_id || null;
      const key = ownerId || '__unassigned__';
      const name = ownerId ? resolveName(ownerId) : 'Unassigned';
      const slot = map.get(key) || { ownerId, name, total: 0, customers: 0, leads: 0 };
      slot.total += 1;
      if (c.status === 'customer') slot.customers += 1;
      else slot.leads += 1;
      map.set(key, slot);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [companies, resolveName]);

  const filteredCompanies = useMemo(() => {
    if (!selected) return [] as Company[];
    const list = companies.filter((c) => {
      const key = c.account_owner_id || '__unassigned__';
      return key === selected;
    });
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter((c) => c.name?.toLowerCase().includes(q) || c.industry?.toLowerCase().includes(q) || c.city?.toLowerCase().includes(q));
  }, [selected, companies, search]);

  const selectedName = selected ? (selected === '__unassigned__' ? 'Unassigned' : resolveName(selected)) : '';

  return (
    <>
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Companies by Account Manager
            <span className="text-xs font-normal text-muted-foreground ml-2">
              {data.length} {data.length === 1 ? 'owner' : 'owners'} • Click a bar to view companies
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
          ) : data.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(260, data.length * 32 + 60)}>
              <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: any, _name: any, props: any) => {
                    const p = props?.payload;
                    return [`${value} (${p?.customers ?? 0} customers, ${p?.leads ?? 0} leads)`, 'Companies'];
                  }}
                />
                <Bar dataKey="total" radius={[0, 6, 6, 0]} cursor="pointer" onClick={(d: any) => setSelected(d?.ownerId || '__unassigned__')}>
                  {data.map((_d, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setSearch(''); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              {selectedName}
              <Badge variant="secondary" className="ml-2">{filteredCompanies.length} companies</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search companies..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="max-h-[60vh] overflow-y-auto space-y-1">
            {filteredCompanies.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">No companies</div>
            ) : (
              filteredCompanies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { onCompanyClick?.(c); setSelected(null); setSearch(''); }}
                  className="w-full text-left p-2 rounded-md hover:bg-muted/60 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.industry || '—'}{c.city ? ` • ${c.city}` : ''}
                    </div>
                  </div>
                  <Badge className={c.status === 'customer' ? 'bg-green-500/20 text-green-700 dark:text-green-400 border-0' : 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-0'}>
                    {c.status}
                  </Badge>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}