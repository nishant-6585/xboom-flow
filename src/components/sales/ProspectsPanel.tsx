import { useState, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useProspects, Prospect } from '@/hooks/useProspects';
import { useAuth } from '@/hooks/useAuth';
import { useOrders } from '@/hooks/useOrders';
import { useSuppliers } from '@/hooks/useSuppliers';
import { Target, Search, Loader2, Star, Filter, TrendingUp, Calendar, Users, Phone, MessageCircle, Package, UserCheck, FileText, Trash2, PhoneOutgoing } from 'lucide-react';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { format, startOfDay, endOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { ACategoryButton } from './ProspectButton';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { ProspectEditDialog } from './ProspectEditDialog';
import { OrderForm, OrderFormInitialData } from '@/components/OrderForm';
import { toast } from 'sonner';
import { LogCallDialog } from './LogCallDialog';
import { AssigneeCell } from './AssigneeCell';
import { LinkToCompanyButton } from './LinkToCompanyButton';
import { SourceCoverageCard } from '@/components/crm/SourceCoverageCard';
import { LeadSourceBadge, normalizeSource } from '@/components/LeadSourceBadge';
import { Target as TargetIcon } from 'lucide-react';

const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'negotiation', 'converted', 'lost'];

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  enquiry: <Package className="h-3.5 w-3.5" />,
  interakt: <MessageCircle className="h-3.5 w-3.5" />,
  myoperator: <Phone className="h-3.5 w-3.5" />,
  email: <Package className="h-3.5 w-3.5" />,
  form_lead: <FileText className="h-3.5 w-3.5" />,
};

const SOURCE_COLORS: Record<string, string> = {
  enquiry: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  interakt: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  myoperator: 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
  email: 'bg-violet-500/20 text-violet-700 dark:text-violet-400',
  form_lead: 'bg-pink-500/20 text-pink-700 dark:text-pink-400',
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
const TOOLTIP_STYLE = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' };

interface ProspectsPanelProps {
  selectedLeadId?: string | null;
}

export function ProspectsPanel({ selectedLeadId }: ProspectsPanelProps = {}) {
  const { prospects, loading, toggleACategory, updateStatus, updateProspectType, deleteProspect, refetch } = useProspects();
  const { user, role } = useAuth();
  const { createOrder } = useOrders();
  const { suppliers } = useSuppliers();
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [aCategoryFilter, setACategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [salespersonFilter, setSalespersonFilter] = useState('all');
  const [dateStart, setDateStart] = useState<Date | undefined>();
  const [dateEnd, setDateEnd] = useState<Date | undefined>();
  const [editingProspect, setEditingProspect] = useState<any>(null);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'all'>('daily');
  const [orderWonProspect, setOrderWonProspect] = useState<Prospect | null>(null);
  const [logCallProspect, setLogCallProspect] = useState<Prospect | null>(null);
  const lastAutoOpenedId = useRef<string | null>(null);

  // Auto-open prospect when selectedLeadId is provided
  useEffect(() => {
    if (!selectedLeadId || loading || prospects.length === 0) return;
    if (lastAutoOpenedId.current === selectedLeadId) return;
    const target = prospects.find(p => p.id === selectedLeadId);
    if (target) {
      lastAutoOpenedId.current = selectedLeadId;
      setEditingProspect(target);
    }
  }, [selectedLeadId, loading, prospects]);

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
    const matchesSalesperson = salespersonFilter === 'all' || (p.created_by_name || 'Unknown') === salespersonFilter;
    const d = new Date(p.created_at);
    const matchesDate = (!dateStart || d >= startOfDay(dateStart)) && (!dateEnd || d <= endOfDay(dateEnd));
    return matchesSearch && matchesSource && matchesStatus && matchesA && matchesType && matchesSalesperson && matchesDate;
  });

  // Unique salesperson list derived from prospects
  const salespeopleOptions = useMemo(() => {
    const names = new Set<string>();
    prospects.forEach(p => { if (p.created_by_name) names.add(p.created_by_name); });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [prospects]);

  // Analytics
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);

  // Filter prospects by selected analytics period
  const periodProspects = useMemo(() => {
    if (analyticsPeriod === 'all') return prospects;
    const cutoff = analyticsPeriod === 'daily' ? todayStart
      : analyticsPeriod === 'weekly' ? weekStart
      : monthStart;
    return prospects.filter(p => new Date(p.created_at) >= cutoff);
  }, [prospects, analyticsPeriod, todayStart, weekStart, monthStart]);

  const todayProspects = prospects.filter(p => new Date(p.created_at) >= todayStart).length;
  const weekProspects = prospects.filter(p => new Date(p.created_at) >= weekStart).length;
  const monthProspects = prospects.filter(p => new Date(p.created_at) >= monthStart).length;
  const totalA = prospects.filter(p => p.is_a_category).length;
  const todayA = prospects.filter(p => p.is_a_category && new Date(p.created_at) >= todayStart).length;
  const weekA = prospects.filter(p => p.is_a_category && new Date(p.created_at) >= weekStart).length;
  const monthA = prospects.filter(p => p.is_a_category && new Date(p.created_at) >= monthStart).length;

  // Creator breakdown
  const creatorData = useMemo(() => {
    const map = new Map<string, { total: number; aCategory: number }>();
    periodProspects.forEach(p => {
      const name = p.created_by_name || 'Unknown';
      const existing = map.get(name) || { total: 0, aCategory: 0 };
      existing.total++;
      if (p.is_a_category) existing.aCategory++;
      map.set(name, existing);
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, total: data.total, aCategory: data.aCategory }))
      .sort((a, b) => b.total - a.total);
  }, [periodProspects]);

  // Type distribution
  const typeData = useMemo(() => {
    const types = ['B2C', 'B2B', 'B2G', 'Reseller', 'Untagged'];
    return types.map(t => ({
      name: t,
      value: periodProspects.filter(p => t === 'Untagged' ? !(p as any).prospect_type : (p as any).prospect_type === t).length,
    })).filter(d => d.value > 0);
  }, [periodProspects]);

  // Source distribution
  const sourceData = ['enquiry', 'interakt', 'myoperator'].map(src => ({
    name: src.charAt(0).toUpperCase() + src.slice(1),
    value: periodProspects.filter(p => p.source_type === src).length,
  })).filter(d => d.value > 0);

  // Status distribution
  const statusData = STATUS_OPTIONS.map(s => ({
    name: s.charAt(0).toUpperCase() + s.slice(1),
    count: periodProspects.filter(p => p.status === s).length,
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

  const periodLabel = analyticsPeriod === 'daily' ? 'Today' : analyticsPeriod === 'weekly' ? 'This Week' : analyticsPeriod === 'monthly' ? 'This Month' : 'All Time';

  return (
    <div className="space-y-6">
      {/* Source-wise entries (matches Companies coverage style) */}
      <SourceCoverageCard
        title="Prospect Entries by Source"
        dataset="prospects"
        Icon={TargetIcon}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
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
        <Card className="bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-destructive" />
              <div>
                <p className="text-xl font-bold">{totalA}</p>
                <p className="text-[10px] text-muted-foreground">A-Category</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card><CardContent className="pt-3 pb-3"><p className="text-xl font-bold text-destructive">{todayA}/{weekA}/{monthA}</p><p className="text-[10px] text-muted-foreground">A: D/W/M</p></CardContent></Card>
        <Card><CardContent className="pt-3 pb-3"><p className="text-xl font-bold text-chart-2">{prospects.filter(p => p.status === 'converted').length}</p><p className="text-[10px] text-muted-foreground">Converted</p></CardContent></Card>
      </div>

      {/* Analytics Period Toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground">Analytics Period:</span>
        {(['daily', 'weekly', 'monthly', 'all'] as const).map(p => (
          <Button key={p} variant={analyticsPeriod === p ? 'default' : 'outline'} size="sm" onClick={() => setAnalyticsPeriod(p)} className="text-xs capitalize">
            {p === 'all' ? 'Till Date' : p}
          </Button>
        ))}
        <Badge variant="secondary" className="ml-2 text-xs">{periodProspects.length} prospects ({periodLabel})</Badge>
      </div>

      {/* Charts Row 1: Trend + Creator Performance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Daily Trend (7d)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="prospects" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Prospects" />
                <Bar dataKey="aCategory" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="A-Category" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><UserCheck className="h-4 w-4" /> Creator Performance ({periodLabel})</CardTitle>
          </CardHeader>
          <CardContent>
            {creatorData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={creatorData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={90} className="fill-muted-foreground" />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Prospects" />
                  <Bar dataKey="aCategory" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} name="A-Category" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No data for this period</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Type + Source + Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Prospect Type ({periodLabel})</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {typeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={typeData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {typeData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-8">No data yet</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Source Distribution ({periodLabel})</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {sourceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={sourceData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {sourceData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-8">No data yet</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Status Breakdown ({periodLabel})</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={statusData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={75} className="fill-muted-foreground" />
                <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Creator Details Table */}
      {creatorData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Creator Details ({periodLabel})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Created By</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">A-Category</TableHead>
                    {['B2C', 'B2B', 'B2G', 'Reseller'].map(t => (
                      <TableHead key={t} className="text-center">{t}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {creatorData.map(c => {
                    const creatorProspects = periodProspects.filter(p => (p.created_by_name || 'Unknown') === c.name);
                    return (
                      <TableRow key={c.name}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-center font-bold">{c.total}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="destructive" className="text-xs">{c.aCategory}</Badge>
                        </TableCell>
                        {['B2C', 'B2B', 'B2G', 'Reseller'].map(t => (
                          <TableCell key={t} className="text-center text-sm">
                            {creatorProspects.filter(p => (p as any).prospect_type === t).length || '—'}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

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
            <Select value={salespersonFilter} onValueChange={setSalespersonFilter}>
              <SelectTrigger className="w-[170px]"><UserCheck className="h-4 w-4 mr-1" /><SelectValue placeholder="Salesperson" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Salespeople</SelectItem>
                {salespeopleOptions.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
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
            <Target className="h-5 w-5 text-primary" />
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
                      <TableHead className="w-[140px]">Assigned To</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => (
                      <TableRow key={p.id} className={`hover:bg-muted/50 cursor-pointer ${p.is_a_category ? 'bg-destructive/5' : ''}`} onClick={() => setEditingProspect(p)}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
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
                          {p.lead_source && normalizeSource(p.lead_source) !== p.source_type && (
                            <div className="mt-1">
                              <LeadSourceBadge source={p.lead_source} size="xs" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell><p className="font-medium text-sm">{p.customer_name}</p></TableCell>
                        <TableCell><span className="text-sm font-mono">{p.phone_number || '—'}</span></TableCell>
                        <TableCell><span className="text-sm">{p.company || '—'}</span></TableCell>
                        <TableCell><span className="text-sm">{p.city || '—'}</span></TableCell>
                        <TableCell><span className="text-sm">{p.product_name || '—'}</span></TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
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
                        <TableCell onClick={(e) => e.stopPropagation()}>
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
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <AssigneeCell userId={p.created_by} name={p.created_by_name} />
                            <LinkToCompanyButton lead={{ customer_name: p.customer_name, company: (p as any).company || (p as any).customer_company, phone: (p as any).phone || (p as any).customer_phone, email: (p as any).email || (p as any).customer_email, city: (p as any).city, source_label: 'Prospect' }} />
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-primary hover:text-primary"
                              onClick={() => setLogCallProspect(p)}
                              title="Log Call"
                            >
                              <PhoneOutgoing className="h-3.5 w-3.5" />
                            </Button>
                            {p.status !== 'converted' && p.status !== 'lost' && (
                              <TooltipProvider>
                                <UITooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-500/10"
                                      onClick={() => setOrderWonProspect(p)}
                                    >
                                      <span className="text-xs font-bold">OW</span>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Mark as Order Won</TooltipContent>
                                </UITooltip>
                                <UITooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-500/10"
                                      onClick={() => updateStatus({ id: p.id, status: 'lost' })}
                                    >
                                      <span className="text-xs font-bold">OL</span>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Mark as Order Lost</TooltipContent>
                                </UITooltip>
                              </TooltipProvider>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Prospect</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete <strong>{p.customer_name}</strong> from prospects? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => deleteProspect(p.id)}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
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

      <Dialog open={!!orderWonProspect} onOpenChange={(open) => !open && setOrderWonProspect(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Create Order — {orderWonProspect?.customer_name}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[75vh] pr-4">
            {orderWonProspect && (
              <OrderForm
                embedded
                onSubmit={async (data, paymentFiles, orderItems, invoiceFile, poFiles) => {
                  const success = await createOrder(data, paymentFiles, orderItems, invoiceFile, poFiles);
                  if (success) {
                    await updateStatus({ id: orderWonProspect.id, status: 'converted' });
                    setOrderWonProspect(null);
                    toast.success('Order created and prospect marked as Converted');
                  }
                  return success;
                }}
                suppliers={suppliers}
                userRole={role as any}
                initialData={{
                  customer_name: orderWonProspect.customer_name,
                  customer_company: orderWonProspect.company || undefined,
                  customer_email: orderWonProspect.email || undefined,
                  product_name: orderWonProspect.product_name || undefined,
                  customer_notes: orderWonProspect.notes || undefined,
                  lead_source: (orderWonProspect.lead_source || orderWonProspect.source_type) as any,
                  source_prospect_id: orderWonProspect.id,
                }}
              />
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <LogCallDialog
        open={!!logCallProspect}
        onOpenChange={(open) => { if (!open) setLogCallProspect(null); }}
        leadSource="prospect"
        leadId={logCallProspect?.id || ''}
        leadName={logCallProspect?.customer_name || ''}
        leadPhone={logCallProspect?.phone_number || ''}
        leadCompany={logCallProspect?.company}
        leadCreatedAt={logCallProspect?.created_at}
      />
    </div>
  );
}
