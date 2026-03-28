import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProspects } from '@/hooks/useProspects';
import { useAuth } from '@/hooks/useAuth';
import { Target, Search, Loader2, Star, Filter, TrendingUp, Calendar, Users, Phone, MessageCircle, Package, Pencil } from 'lucide-react';
import { format, startOfDay, endOfDay, startOfWeek, startOfMonth, endOfWeek, endOfMonth } from 'date-fns';
import { ACategoryButton } from './ProspectButton';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ProspectEditDialog } from './ProspectEditDialog';

const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'negotiation', 'converted', 'lost'];

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  enquiry: <Package className="h-3.5 w-3.5" />,
  interakt: <MessageCircle className="h-3.5 w-3.5" />,
  myoperator: <Phone className="h-3.5 w-3.5" />,
};

const SOURCE_COLORS: Record<string, string> = {
  enquiry: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  interakt: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  myoperator: 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
};

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  contacted: 'bg-purple-500/20 text-purple-700 dark:text-purple-400',
  qualified: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
  negotiation: 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-400',
  converted: 'bg-green-500/20 text-green-700 dark:text-green-400',
  lost: 'bg-red-500/20 text-red-700 dark:text-red-400',
};

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export function ProspectsPanel() {
  const { prospects, loading, toggleACategory, updateStatus, updateProspectType, refetch } = useProspects();
  const { user, role } = useAuth();
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [aCategoryFilter, setACategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateStart, setDateStart] = useState<Date | undefined>();
  const [dateEnd, setDateEnd] = useState<Date | undefined>();
  const [editingProspect, setEditingProspect] = useState<any>(null);

  const filtered = prospects.filter(p => {
    const matchesSearch = !search ||
      p.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      (p.company && p.company.toLowerCase().includes(search.toLowerCase())) ||
      (p.phone_number && p.phone_number.includes(search)) ||
      (p.product_name && p.product_name.toLowerCase().includes(search.toLowerCase()));
    const matchesSource = sourceFilter === 'all' || p.source_type === sourceFilter;
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchesA = aCategoryFilter === 'all' || (aCategoryFilter === 'yes' ? p.is_a_category : !p.is_a_category);
    const matchesType = typeFilter === 'all' || (p as any).prospect_type === typeFilter;
    const d = new Date(p.created_at);
    const matchesDate = (!dateStart || d >= startOfDay(dateStart)) && (!dateEnd || d <= endOfDay(dateEnd));
    return matchesSearch && matchesSource && matchesStatus && matchesA && matchesType && matchesDate;
  });

  // Analytics
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);

  const todayProspects = prospects.filter(p => new Date(p.created_at) >= todayStart).length;
  const weekProspects = prospects.filter(p => new Date(p.created_at) >= weekStart).length;
  const monthProspects = prospects.filter(p => new Date(p.created_at) >= monthStart).length;
  const totalA = prospects.filter(p => p.is_a_category).length;
  const todayA = prospects.filter(p => p.is_a_category && new Date(p.created_at) >= todayStart).length;
  const weekA = prospects.filter(p => p.is_a_category && new Date(p.created_at) >= weekStart).length;
  const monthA = prospects.filter(p => p.is_a_category && new Date(p.created_at) >= monthStart).length;

  // Source distribution for pie chart
  const sourceData = ['enquiry', 'interakt', 'myoperator'].map(src => ({
    name: src.charAt(0).toUpperCase() + src.slice(1),
    value: prospects.filter(p => p.source_type === src).length,
  })).filter(d => d.value > 0);

  // Status distribution for bar chart
  const statusData = STATUS_OPTIONS.map(s => ({
    name: s.charAt(0).toUpperCase() + s.slice(1),
    count: prospects.filter(p => p.status === s).length,
  }));

  // Daily trend (last 7 days)
  const dailyData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayStart = startOfDay(d);
    const dayEnd = endOfDay(d);
    return {
      day: format(d, 'EEE'),
      prospects: prospects.filter(p => { const pd = new Date(p.created_at); return pd >= dayStart && pd <= dayEnd; }).length,
      aCategory: prospects.filter(p => { const pd = new Date(p.created_at); return pd >= dayStart && pd <= dayEnd && p.is_a_category; }).length,
    };
  });

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-xl font-bold">{prospects.length}</p>
                <p className="text-[10px] text-muted-foreground">Total Prospects</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card><CardContent className="pt-3 pb-3"><p className="text-xl font-bold">{todayProspects}</p><p className="text-[10px] text-muted-foreground">Today</p></CardContent></Card>
        <Card><CardContent className="pt-3 pb-3"><p className="text-xl font-bold">{weekProspects}</p><p className="text-[10px] text-muted-foreground">This Week</p></CardContent></Card>
        <Card><CardContent className="pt-3 pb-3"><p className="text-xl font-bold">{monthProspects}</p><p className="text-[10px] text-muted-foreground">This Month</p></CardContent></Card>
        <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-xl font-bold">{totalA}</p>
                <p className="text-[10px] text-muted-foreground">A-Category</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card><CardContent className="pt-3 pb-3"><p className="text-xl font-bold text-red-600">{todayA}/{weekA}/{monthA}</p><p className="text-[10px] text-muted-foreground">A: D/W/M</p></CardContent></Card>
        <Card><CardContent className="pt-3 pb-3"><p className="text-xl font-bold text-green-600">{prospects.filter(p => p.status === 'converted').length}</p><p className="text-[10px] text-muted-foreground">Converted</p></CardContent></Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Daily Trend (7d)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                <Bar dataKey="prospects" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Prospects" />
                <Bar dataKey="aCategory" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="A-Category" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Source Distribution</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {sourceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={sourceData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {sourceData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-8">No data yet</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={statusData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={75} className="fill-muted-foreground" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search prospects..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[130px]"><Filter className="h-4 w-4 mr-1" /><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="enquiry">Leads</SelectItem>
                <SelectItem value="interakt">Interakt</SelectItem>
                <SelectItem value="myoperator">MyOperator</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={aCategoryFilter} onValueChange={setACategoryFilter}>
              <SelectTrigger className="w-[130px]"><Star className="h-4 w-4 mr-1" /><SelectValue placeholder="A-Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="yes">A-Category Only</SelectItem>
                <SelectItem value="no">Non A-Category</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[130px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="B2C">B2C</SelectItem>
                <SelectItem value="B2B">B2B</SelectItem>
                <SelectItem value="B2G">B2G</SelectItem>
                <SelectItem value="Reseller">Reseller</SelectItem>
              </SelectContent>
            </Select>
            <DateRangeFilter
              startDate={dateStart} endDate={dateEnd}
              onStartDateChange={setDateStart} onEndDateChange={setDateEnd}
              onClear={() => { setDateStart(undefined); setDateEnd(undefined); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Prospects Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-amber-600" />
            Prospects ({filtered.length})
          </CardTitle>
          <CardDescription>Qualified contacts from Leads, Interakt & MyOperator</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No prospects yet</h3>
              <p className="text-muted-foreground">Use the golden "P" button on Leads, Interakt, or MyOperator to add prospects</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[40px]">A</TableHead>
                      <TableHead className="w-[80px]">Source</TableHead>
                      <TableHead className="w-[160px]">Customer</TableHead>
                      <TableHead className="w-[120px]">Phone</TableHead>
                      <TableHead className="w-[120px]">Company</TableHead>
                      <TableHead className="w-[100px]">City</TableHead>
                      <TableHead className="w-[120px]">Product</TableHead>
                      <TableHead className="w-[80px]">Type</TableHead>
                      <TableHead className="w-[90px]">Status</TableHead>
                      <TableHead className="w-[90px]">Date</TableHead>
                      <TableHead className="w-[100px]">By</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => (
                      <TableRow key={p.id} className={`hover:bg-muted/50 ${p.is_a_category ? 'bg-red-500/5' : ''}`}>
                        <TableCell>
                          <ACategoryButton
                            sourceType={p.source_type}
                            sourceId={p.source_id}
                            isACategory={p.is_a_category}
                            onToggle={() => user && toggleACategory({ id: p.id, isACategory: !p.is_a_category, userId: user.id })}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] gap-1 ${SOURCE_COLORS[p.source_type]}`}>
                            {SOURCE_ICONS[p.source_type]}
                            {p.source_type === 'myoperator' ? 'MyOp' : p.source_type.charAt(0).toUpperCase() + p.source_type.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell><p className="font-medium text-sm">{p.customer_name}</p></TableCell>
                        <TableCell><span className="text-sm font-mono">{p.phone_number || '—'}</span></TableCell>
                        <TableCell><span className="text-sm">{p.company || '—'}</span></TableCell>
                        <TableCell><span className="text-sm">{p.city || '—'}</span></TableCell>
                        <TableCell><span className="text-sm">{p.product_name || '—'}</span></TableCell>
                        <TableCell>
                          <Select value={(p as any).prospect_type || 'none'} onValueChange={(v) => updateProspectType({ id: p.id, prospectType: v === 'none' ? null : v })}>
                            <SelectTrigger className="h-7 text-xs w-[90px]">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">—</SelectItem>
                              <SelectItem value="B2C">B2C</SelectItem>
                              <SelectItem value="B2B">B2B</SelectItem>
                              <SelectItem value="B2G">B2G</SelectItem>
                              <SelectItem value="Reseller">Reseller</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select value={p.status} onValueChange={(v) => updateStatus({ id: p.id, status: v })}>
                            <SelectTrigger className="h-7 text-xs w-[100px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell><span className="text-xs text-muted-foreground">{format(new Date(p.created_at), 'dd MMM')}</span></TableCell>
                        <TableCell><span className="text-xs text-muted-foreground">{p.created_by_name}</span></TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingProspect(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ProspectEditDialog
        open={!!editingProspect}
        onOpenChange={(open) => { if (!open) setEditingProspect(null); }}
        prospect={editingProspect}
        onSuccess={() => { setEditingProspect(null); refetch(); }}
      />
    </div>
  );
}
