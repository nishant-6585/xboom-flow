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
    return list;
  }, [companies, search, statusFilter]);

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
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Total Value</TableHead>
                  <TableHead>Recurring</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No companies found</TableCell>
                  </TableRow>
                ) : (
                  filtered.map(company => (
                    <TableRow
                      key={company.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => { setSelectedCompany(company); setDrawerOpen(true); }}
                    >
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
