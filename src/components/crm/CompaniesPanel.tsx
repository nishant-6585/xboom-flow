import { useState, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCompanies, Company } from '@/hooks/useCompanies';
import { useAuth } from '@/hooks/useAuth';
import { usePushToCompany } from '@/hooks/usePushToCompany';
import { useLeadContactsForCompany, INDUSTRY_OPTIONS } from '@/hooks/useLeadContactsForCompany';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CompanyDetailDrawer } from './CompanyDetailDrawer';
import { CompanyDashboard } from './CompanyDashboard';
import { LeadCompanyCoverage } from './LeadCompanyCoverage';
import { CompanyBucketAnalysis } from './CompanyBucketAnalysis';
import { CompanyBucketBadge } from './CompanyBucketBadge';
import { CompanyTierBadge } from './CompanyTierBadge';
import { CompanyHealthBadge } from './CompanyHealthBadge';
import { Checkbox } from '@/components/ui/checkbox';
import { useBulkUpdateCompanies, useCompanySavedViews } from '@/hooks/useCompanyCrm';
import { classifyCompanies, type Bucket } from '@/lib/companyBuckets';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Search, Building2, Plus, Filter, ChevronRight, Loader2,
  RefreshCw, Users, TrendingUp, IndianRupee, Download, Check, ChevronsUpDown, UserPlus
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CompaniesPanelProps {
  selectedLeadId?: string | null;
}

export function CompaniesPanel({ selectedLeadId }: CompaniesPanelProps = {}) {
  const { companies, loading, addCompany, adding } = useCompanies();
  const { user, userName } = useAuth();
  const { syncAllLeadsToCompanies } = usePushToCompany();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [bucketFilter, setBucketFilter] = useState<'all' | Bucket>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [healthFilter, setHealthFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const bulkUpdate = useBulkUpdateCompanies();
  const { views, saveView, deleteView } = useCompanySavedViews();
  const [saveViewName, setSaveViewName] = useState('');
  const [showSaveView, setShowSaveView] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState({ name: '', industry: '', city: '', state: '', phone: '', email: '', website: '', notes: '' });
  const [industryOpen, setIndustryOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const { data: leadContacts = [] } = useLeadContactsForCompany();
  const [primaryContactName, setPrimaryContactName] = useState<string>('');
  const lastAutoOpenedId = useRef<string | null>(null);

  // Auto-open company when selectedLeadId is provided
  useEffect(() => {
    if (!selectedLeadId || loading || companies.length === 0) return;
    if (lastAutoOpenedId.current === selectedLeadId) return;
    const target = companies.find(c => c.id === selectedLeadId);
    if (target) {
      lastAutoOpenedId.current = selectedLeadId;
      setSelectedCompany(target);
      setDrawerOpen(true);
    }
  }, [selectedLeadId, loading, companies]);

  const classification = useMemo(() => classifyCompanies(companies), [companies]);

  const filtered = useMemo(() => {
    let list = [...companies];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        (c.name?.toLowerCase().includes(q) ?? false) ||
        c.city?.toLowerCase().includes(q) ||
        c.industry?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') list = list.filter(c => c.status === statusFilter);
    if (bucketFilter !== 'all') list = list.filter(c => classification.get(c.id) === bucketFilter);
    if (tierFilter !== 'all') list = list.filter(c => (c.tier || '') === tierFilter);
    if (healthFilter !== 'all') list = list.filter(c => (c.health_band || 'watch') === healthFilter);
    return list;
  }, [companies, search, statusFilter, bucketFilter, tierFilter, healthFilter, classification]);

  const allSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(c.id));
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(c => c.id)));
  };
  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const applyBulkTier = (t: 'A' | 'B' | 'C') => {
    if (selectedIds.size === 0) return;
    bulkUpdate.mutate(
      { ids: Array.from(selectedIds), updates: { tier: t, tier_source: 'manual', tier_locked_at: new Date().toISOString(), tier_locked_by: user?.id } },
      { onSuccess: () => setSelectedIds(new Set()) }
    );
  };

  const exportCsv = () => {
    const rows = filtered.map(c => ({
      name: c.name, tier: c.tier || '', health_score: c.health_score || '', health_band: c.health_band || '',
      industry: c.industry || '', city: c.city || '', status: c.status, orders: c.total_orders_count,
      total_value: c.total_order_value, potential: c.potential_value || 0, pipeline: c.pipeline_value || 0,
      last_order_at: c.last_order_at || '', last_activity_at: c.last_activity_at || '',
    }));
    const headers = Object.keys(rows[0] || { name: '' });
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify((r as any)[h] ?? '')).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `companies_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveView = async () => {
    if (!saveViewName.trim() || !user) return;
    await saveView({
      user_id: user.id,
      name: saveViewName,
      filters: { search, statusFilter, bucketFilter, tierFilter, healthFilter },
    });
    setSaveViewName('');
    setShowSaveView(false);
  };

  const applyView = (v: any) => {
    const f = v.filters || {};
    setSearch(f.search || '');
    setStatusFilter(f.statusFilter || 'all');
    setBucketFilter(f.bucketFilter || 'all');
    setTierFilter(f.tierFilter || 'all');
    setHealthFilter(f.healthFilter || 'all');
  };

  const totalCustomers = companies.filter(c => c.status === 'customer').length;
  const totalLeads = companies.filter(c => c.status === 'lead').length;
  const recurringCount = companies.filter(c => c.is_recurring).length;
  const totalValue = companies.reduce((s, c) => s + (c.total_order_value || 0), 0);

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await addCompany({
      name: form.name,
      industry: form.industry || null,
      city: form.city || null,
      state: form.state || null,
      phone: form.phone || null,
      email: form.email || null,
      website: form.website || null,
      notes: form.notes || null,
      created_by: user?.id || '',
      created_by_name: userName || '',
    });
    setForm({ name: '', industry: '', city: '', state: '', phone: '', email: '', website: '', notes: '' });
    setPrimaryContactName('');
    setAddOpen(false);
  };

  const handleSyncFromLeads = async () => {
    if (!user) return;
    setSyncing(true);
    try {
      const r = await syncAllLeadsToCompanies();
      if (r.companiesCreated === 0 && r.companiesUpdated === 0 && r.contactsCreated === 0) {
        toast.info(`Scanned ${r.scanned} leads — nothing new to sync.`);
      } else {
        toast.success(
          `Synced from ${r.scanned} leads: +${r.companiesCreated} companies, ${r.companiesUpdated} updated, +${r.contactsCreated} contacts`
        );
        window.location.reload();
      }
    } catch (err: any) {
      toast.error(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dashboard Visuals */}
      <CompanyDashboard companies={companies} />

      {/* ABC Bucket Analysis */}
      <CompanyBucketAnalysis companies={companies} />

      {/* Lead Source Coverage */}
      <LeadCompanyCoverage />

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/50 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Building2 className="h-4 w-4 text-primary" /></div>
              <div>
                <div className="text-2xl font-bold">{companies.length}</div>
                <div className="text-xs text-muted-foreground">Total Companies</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-gradient-to-br from-green-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10"><Users className="h-4 w-4 text-green-600" /></div>
              <div>
                <div className="text-2xl font-bold">{totalCustomers}</div>
                <div className="text-xs text-muted-foreground">Customers</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10"><RefreshCw className="h-4 w-4 text-amber-600" /></div>
              <div>
                <div className="text-2xl font-bold">{recurringCount}</div>
                <div className="text-xs text-muted-foreground">Recurring</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-gradient-to-br from-indigo-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/10"><IndianRupee className="h-4 w-4 text-indigo-600" /></div>
              <div>
                <div className="text-2xl font-bold">₹{(totalValue / 100000).toFixed(1)}L</div>
                <div className="text-xs text-muted-foreground">Total Value</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Companies Table */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Companies
            </CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search companies..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]">
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="lead">Leads</SelectItem>
                  <SelectItem value="customer">Customers</SelectItem>
                </SelectContent>
              </Select>
              <Select value={bucketFilter} onValueChange={(v) => setBucketFilter(v as 'all' | Bucket)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Bucket" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Buckets</SelectItem>
                  <SelectItem value="A">Bucket A</SelectItem>
                  <SelectItem value="B">Bucket B</SelectItem>
                  <SelectItem value="C">Bucket C</SelectItem>
                </SelectContent>
              </Select>
              <Select value={tierFilter} onValueChange={setTierFilter}>
                <SelectTrigger className="w-[110px]">
                  <SelectValue placeholder="Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tiers</SelectItem>
                  <SelectItem value="A">Tier A</SelectItem>
                  <SelectItem value="B">Tier B</SelectItem>
                  <SelectItem value="C">Tier C</SelectItem>
                  <SelectItem value="">Untiered</SelectItem>
                </SelectContent>
              </Select>
              <Select value={healthFilter} onValueChange={setHealthFilter}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Health" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Health</SelectItem>
                  <SelectItem value="healthy">Healthy</SelectItem>
                  <SelectItem value="watch">Watch</SelectItem>
                  <SelectItem value="at_risk">At Risk</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" />Add</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Company</DialogTitle></DialogHeader>
                  <div className="grid gap-3">
                    <div><Label>Company Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                    <div>
                      <Label>Primary Contact (from existing leads)</Label>
                      <Popover open={contactOpen} onOpenChange={setContactOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                            <span className="flex items-center gap-2 truncate">
                              <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                              {primaryContactName || 'Select contact from leads...'}
                            </span>
                            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search by name, phone, email, company..." />
                            <CommandList className="max-h-72">
                              <CommandEmpty>No matching leads.</CommandEmpty>
                              <CommandGroup>
                                {leadContacts.slice(0, 500).map(c => (
                                  <CommandItem
                                    key={c.key}
                                    value={`${c.name} ${c.phone || ''} ${c.email || ''} ${c.company || ''}`}
                                    onSelect={() => {
                                      setPrimaryContactName(c.name);
                                      setForm(f => ({
                                        ...f,
                                        phone: f.phone || c.phone || '',
                                        email: f.email || c.email || '',
                                        name: f.name || c.company || '',
                                        city: f.city || c.city || '',
                                      }));
                                      setContactOpen(false);
                                    }}
                                  >
                                    <Check className={cn('mr-2 h-3.5 w-3.5', primaryContactName === c.name ? 'opacity-100' : 'opacity-0')} />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm truncate">{c.name}</div>
                                      <div className="text-[11px] text-muted-foreground truncate">
                                        {[c.company, c.phone, c.email].filter(Boolean).join(' · ')}
                                      </div>
                                    </div>
                                    <Badge variant="outline" className="ml-2 text-[9px]">{c.source}</Badge>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Industry</Label>
                        <Popover open={industryOpen} onOpenChange={setIndustryOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                              <span className="truncate">{form.industry || 'Select industry...'}</span>
                              <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                            <Command>
                              <CommandInput
                                placeholder="Search or type custom..."
                                value={form.industry}
                                onValueChange={(v) => setForm(f => ({ ...f, industry: v }))}
                              />
                              <CommandList className="max-h-60">
                                <CommandEmpty>
                                  <button
                                    type="button"
                                    className="text-xs underline"
                                    onClick={() => setIndustryOpen(false)}
                                  >
                                    Use "{form.industry}"
                                  </button>
                                </CommandEmpty>
                                <CommandGroup>
                                  {INDUSTRY_OPTIONS.map(opt => (
                                    <CommandItem
                                      key={opt}
                                      value={opt}
                                      onSelect={() => { setForm(f => ({ ...f, industry: opt })); setIndustryOpen(false); }}
                                    >
                                      <Check className={cn('mr-2 h-3.5 w-3.5', form.industry === opt ? 'opacity-100' : 'opacity-0')} />
                                      {opt}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div><Label>City</Label><Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                      <div><Label>Email</Label><Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                    </div>
                    <div><Label>Website</Label><Input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} /></div>
                    <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
                    <Button onClick={handleAdd} disabled={adding || !form.name.trim()}>
                      {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Add Company
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleSyncFromLeads} disabled={syncing}>
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Sync from Leads
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={exportCsv}>
                <Download className="h-4 w-4" />CSV
              </Button>
            </div>
          </div>
          {/* Saved views + bulk toolbar */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Views:</span>
            {views.length === 0 && <span className="text-[10px] text-muted-foreground">No saved views yet</span>}
            {views.map(v => (
              <div key={v.id} className="flex items-center gap-1 rounded-md border border-border/50 px-2 py-0.5 text-[11px]">
                <button onClick={() => applyView(v)} className="hover:underline">{v.name}{v.is_shared ? ' 🔗' : ''}</button>
                {v.user_id === user?.id && (
                  <button onClick={() => deleteView(v.id)} className="text-muted-foreground hover:text-destructive">×</button>
                )}
              </div>
            ))}
            <Popover open={showSaveView} onOpenChange={setShowSaveView}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1"><Plus className="h-3 w-3" />Save current</Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2 space-y-2" align="start">
                <Input className="h-8 text-xs" placeholder="View name..." value={saveViewName} onChange={e => setSaveViewName(e.target.value)} />
                <Button size="sm" className="w-full text-xs h-8" onClick={handleSaveView} disabled={!saveViewName.trim()}>Save view</Button>
              </PopoverContent>
            </Popover>
            {selectedIds.size > 0 && (
              <div className="ml-auto flex items-center gap-2 rounded-md bg-primary/10 px-2 py-1">
                <span className="text-xs font-medium">{selectedIds.size} selected</span>
                <span className="text-[10px] text-muted-foreground">Bulk re-tier:</span>
                <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => applyBulkTier('A')}>A</Button>
                <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => applyBulkTier('B')}>B</Button>
                <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => applyBulkTier('C')}>C</Button>
                <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setSelectedIds(new Set())}>Clear</Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  </TableHead>
                  <TableHead className="w-14">Bucket</TableHead>
                  <TableHead className="w-14">Tier</TableHead>
                  <TableHead className="w-24">Health</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Total Value</TableHead>
                  <TableHead>Pipeline</TableHead>
                  <TableHead>Recurring</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No companies found</TableCell>
                  </TableRow>
                ) : (
                  filtered.map(company => (
                    <TableRow
                      key={company.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => { setSelectedCompany(company); setDrawerOpen(true); }}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selectedIds.has(company.id)} onCheckedChange={() => toggleOne(company.id)} />
                      </TableCell>
                      <TableCell>
                        <CompanyBucketBadge bucket={classification.get(company.id) ?? 'C'} />
                      </TableCell>
                      <TableCell>
                        <CompanyTierBadge tier={company.tier as any} source={company.tier_source as any} />
                      </TableCell>
                      <TableCell>
                        <CompanyHealthBadge score={company.health_score} band={company.health_band as any} />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{company.name}</div>
                        {company.city && <div className="text-xs text-muted-foreground">{company.city}{company.state ? `, ${company.state}` : ''}</div>}
                      </TableCell>
                      <TableCell><span className="text-sm">{company.industry || '—'}</span></TableCell>
                      <TableCell>
                        <Badge className={cn('text-[10px] border-0', company.status === 'customer' ? 'bg-green-500/20 text-green-700 dark:text-green-400' : 'bg-blue-500/20 text-blue-700 dark:text-blue-400')}>
                          {company.status}
                        </Badge>
                      </TableCell>
                      <TableCell><span className="text-sm font-medium">{company.total_orders_count}</span></TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">
                          {company.total_order_value > 0 ? `₹${(company.total_order_value / 100000).toFixed(1)}L` : '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {company.pipeline_value && company.pipeline_value > 0 ? `₹${(company.pipeline_value / 100000).toFixed(1)}L` : '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {company.is_recurring ? (
                          <Badge className="text-[10px] border-0 bg-amber-500/20 text-amber-700 dark:text-amber-400">
                            <RefreshCw className="h-2.5 w-2.5 mr-0.5" />Recurring
                          </Badge>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <CompanyDetailDrawer company={selectedCompany} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
