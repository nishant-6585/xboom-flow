import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFollowups, Followup } from '@/hooks/useFollowups';
import { useAuth } from '@/hooks/useAuth';
import { format, isToday, isBefore, startOfDay, endOfDay, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameDay, eachDayOfInterval, getDay } from 'date-fns';
import { Calendar, List, Search, CheckCircle2, Clock, AlertTriangle, Phone, Mail, Package, User, ChevronLeft, ChevronRight, Filter, Plus, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AssigneeCell } from './AssigneeCell';
import { LinkToCompanyButton } from './LinkToCompanyButton';
import { SourceCoverageCard } from '@/components/crm/SourceCoverageCard';
import { RefreshCw as RefreshIcon } from 'lucide-react';

export function FollowupsPanel() {
  const { followups, loading, completeFollowup, rescheduleFollowup, cancelFollowup, createFollowup } = useFollowups();
  const { user, role, profile } = useAuth();
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [completingFollowup, setCompletingFollowup] = useState<Followup | null>(null);
  const [remark, setRemark] = useState('');
  const [completing, setCompleting] = useState(false);

  // New follow-up dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [prefillFrom, setPrefillFrom] = useState<Followup | null>(null);
  const [newFollowup, setNewFollowup] = useState({
    customer_name: '',
    customer_company: '',
    product_name: '',
    phone: '',
    email: '',
    source_type: 'prospect' as 'prospect' | 'pipeline' | 'enquiry' | 'lead' | 'company',
    followup_at: '',
  });

  const isManager = role === 'admin' || role === 'supply_chain' || role === 'sales_manager';

  const now = new Date();

  const getFollowupColor = (f: Followup): string => {
    if (f.status === 'completed') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
    if (f.status === 'cancelled') return 'bg-muted text-muted-foreground border-border';
    if (f.is_a_category) return 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30';
    if (isToday(new Date(f.followup_at))) return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30';
    if (isBefore(new Date(f.followup_at), now) && f.status === 'pending') return 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30';
    return 'bg-primary/10 text-primary border-primary/20';
  };

  const getStatusBadge = (f: Followup) => {
    if (f.status === 'completed') return <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-0 text-[10px]">✅ Done</Badge>;
    if (f.status === 'cancelled') return <Badge variant="secondary" className="text-[10px]">Cancelled</Badge>;
    if (f.is_a_category && f.status === 'pending') return <Badge className="bg-red-500/20 text-red-700 dark:text-red-400 border-0 text-[10px] animate-pulse">🔴 A-Priority</Badge>;
    if (isBefore(new Date(f.followup_at), now) && f.status === 'pending') return <Badge className="bg-red-500/20 text-red-700 dark:text-red-400 border-0 text-[10px]">⏰ Overdue</Badge>;
    if (isToday(new Date(f.followup_at))) return <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-400 border-0 text-[10px]">🟠 Today</Badge>;
    return <Badge className="bg-primary/15 text-primary border-0 text-[10px]">Upcoming</Badge>;
  };

  const filtered = useMemo(() => {
    let items = followups;
    if (statusFilter === 'active') items = items.filter(f => f.status === 'pending');
    else if (statusFilter === 'completed') items = items.filter(f => f.status === 'completed');
    else if (statusFilter === 'today') items = items.filter(f => isToday(new Date(f.followup_at)));
    else if (statusFilter === 'overdue') items = items.filter(f => f.status === 'pending' && isBefore(new Date(f.followup_at), now));

    if (ownerFilter !== 'all') {
      items = items.filter(f => {
        const owner = (f as any).user_id || f.created_by;
        return ownerFilter === 'unassigned'
          ? !owner
          : owner === ownerFilter;
      });
    }

    if (search) {
      const q = search.toLowerCase();
      items = items.filter(f =>
        (f.customer_name?.toLowerCase().includes(q) ?? false) ||
        f.customer_company?.toLowerCase().includes(q) ||
        f.product_name?.toLowerCase().includes(q) ||
        f.created_by_name?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [followups, statusFilter, ownerFilter, search, now]);

  // Salesperson options derived from the loaded follow-ups
  const ownerOptions = useMemo(() => {
    const map = new Map<string, string>();
    followups.forEach(f => {
      const id = (f as any).user_id || f.created_by;
      if (id) map.set(id, f.created_by_name || 'Unknown');
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [followups]);

  // Stats
  const todayCount = followups.filter(f => f.status === 'pending' && isToday(new Date(f.followup_at))).length;
  const overdueCount = followups.filter(f => f.status === 'pending' && isBefore(new Date(f.followup_at), startOfDay(now))).length;
  const completedToday = followups.filter(f => f.status === 'completed' && f.completed_at && isToday(new Date(f.completed_at))).length;
  const aCategoryPending = followups.filter(f => f.status === 'pending' && f.is_a_category).length;

  const handleComplete = (f: Followup) => {
    setCompletingFollowup(f);
    setRemark('');
    setCompleteDialogOpen(true);
  };

  const submitComplete = async () => {
    if (!completingFollowup || !remark.trim()) return;
    setCompleting(true);
    await completeFollowup(completingFollowup.id, remark.trim());
    setCompleting(false);
    setCompleteDialogOpen(false);
    setCompletingFollowup(null);
  };

  // Open create dialog for manual new follow-up
  const openCreateDialog = (fromFollowup?: Followup) => {
    if (fromFollowup) {
      setPrefillFrom(fromFollowup);
      setNewFollowup({
        customer_name: fromFollowup.customer_name,
        customer_company: fromFollowup.customer_company || '',
        product_name: fromFollowup.product_name || '',
        phone: fromFollowup.phone || '',
        email: fromFollowup.email || '',
        source_type: fromFollowup.source_type,
        followup_at: '',
      });
    } else {
      setPrefillFrom(null);
      setNewFollowup({
        customer_name: '',
        customer_company: '',
        product_name: '',
        phone: '',
        email: '',
        source_type: 'prospect',
        followup_at: '',
      });
    }
    setCreateDialogOpen(true);
  };

  const submitCreate = async () => {
    if (!newFollowup.customer_name.trim() || !newFollowup.followup_at) {
      toast.error('Customer name and follow-up date are required');
      return;
    }
    setCreating(true);
    try {
      await createFollowup({
        source_type: newFollowup.source_type,
        source_id: prefillFrom?.source_id || crypto.randomUUID(),
        customer_name: newFollowup.customer_name.trim(),
        customer_company: newFollowup.customer_company || null,
        product_name: newFollowup.product_name || null,
        phone: newFollowup.phone || null,
        email: newFollowup.email || null,
        is_a_category: prefillFrom?.is_a_category || false,
        followup_at: newFollowup.followup_at,
      });
      setCreateDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create follow-up');
    } finally {
      setCreating(false);
    }
  };

  // Calendar view
  const calendarStart = startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getFollowupsForDay = useCallback((day: Date) => {
    return followups.filter(f => {
      const fDate = new Date(f.followup_at);
      return isSameDay(fDate, day) && f.status !== 'cancelled';
    });
  }, [followups]);

  return (
    <div className="space-y-4">
      {/* Source-wise entries (matches Companies coverage style) */}
      <SourceCoverageCard
        title="Follow-up Entries by Source"
        dataset="followups"
        Icon={RefreshIcon}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-3">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{todayCount}</div>
            <div className="text-xs text-muted-foreground">Today's Follow-ups</div>
          </CardContent>
        </Card>
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-3">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{overdueCount}</div>
            <div className="text-xs text-muted-foreground">Overdue</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-3">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{completedToday}</div>
            <div className="text-xs text-muted-foreground">Completed Today</div>
          </CardContent>
        </Card>
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-3">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{aCategoryPending}</div>
            <div className="text-xs text-muted-foreground">A-Category Pending</div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 rounded-xl" />
        </div>
        <Button size="sm" className="h-9 rounded-xl gap-1.5" onClick={() => openCreateDialog()}>
          <Plus className="w-4 h-4" /> New Follow-up
        </Button>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9 rounded-xl">
            <Filter className="w-3.5 h-3.5 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="w-[180px] h-9 rounded-xl">
            <User className="w-3.5 h-3.5 mr-1" />
            <SelectValue placeholder="All salespersons" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All salespersons</SelectItem>
            {ownerOptions.map(o => (
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
            ))}
            <SelectItem value="unassigned">Unassigned</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex rounded-xl border border-border overflow-hidden">
          <Button variant={view === 'list' ? 'default' : 'ghost'} size="sm" className="rounded-none h-9 px-3" onClick={() => setView('list')}>
            <List className="w-4 h-4 mr-1" /> List
          </Button>
          <Button variant={view === 'calendar' ? 'default' : 'ghost'} size="sm" className="rounded-none h-9 px-3" onClick={() => setView('calendar')}>
            <Calendar className="w-4 h-4 mr-1" /> Calendar
          </Button>
        </div>
      </div>

      {/* List View */}
      {view === 'list' && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Status</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No follow-ups found
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map(f => (
                  <TableRow key={f.id} className={cn("transition-colors", f.status === 'completed' && "opacity-60")}>
                    <TableCell>{getStatusBadge(f)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {f.is_a_category && <span className="bg-red-500/20 text-red-600 dark:text-red-400 text-[9px] font-bold px-1 rounded">A</span>}
                        <div>
                          <div className="font-medium text-sm">{f.customer_name}</div>
                          {f.customer_company && <div className="text-xs text-muted-foreground">{f.customer_company}</div>}
                          <div className="flex items-center gap-2 mt-0.5">
                            {f.phone && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{f.phone}</span>}
                            {f.email && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Mail className="w-2.5 h-2.5" />{f.email}</span>}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{f.customer_company || '—'}</TableCell>
                    <TableCell className="text-sm">{f.product_name || '-'}</TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{format(new Date(f.followup_at), 'dd MMM yyyy')}</div>
                      <div className="text-xs text-muted-foreground">{format(new Date(f.followup_at), 'hh:mm a')}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize">{f.source_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <AssigneeCell userId={(f as any).user_id} name={f.created_by_name} />
                        <LinkToCompanyButton lead={{ customer_name: f.customer_name, company: f.customer_company, phone: f.phone, email: f.email, source_label: 'Followup' }} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {f.status === 'pending' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10" onClick={() => handleComplete(f)}>
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Done
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs rounded-lg border-primary/30 text-primary hover:bg-primary/10"
                          onClick={() => openCreateDialog(f)}
                          title="Schedule another follow-up for this customer"
                        >
                          <RefreshCw className="w-3 h-3 mr-1" /> Re-Follow
                        </Button>
                      </div>
                      {f.status === 'completed' && f.remark && (
                        <span className="text-xs text-muted-foreground italic block mt-1">"{f.remark}"</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Calendar View */}
      {view === 'calendar' && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <CardTitle className="text-base">{format(calendarMonth, 'MMMM yyyy')}</CardTitle>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-2">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-px mb-1">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
              ))}
            </div>
            {/* Days grid */}
            <div className="grid grid-cols-7 gap-px">
              {calendarDays.map(day => {
                const dayFollowups = getFollowupsForDay(day);
                const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                const isCurrentDay = isToday(day);
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "min-h-[80px] p-1 rounded-lg border transition-colors",
                      isCurrentMonth ? "bg-background border-border/50" : "bg-muted/30 border-transparent",
                      isCurrentDay && "ring-2 ring-primary/30 bg-primary/5"
                    )}
                  >
                    <div className={cn(
                      "text-xs font-medium mb-0.5",
                      isCurrentDay ? "text-primary font-bold" : isCurrentMonth ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-0.5">
                      {dayFollowups.slice(0, 3).map(f => (
                        <div
                          key={f.id}
                          className={cn(
                            "text-[9px] px-1 py-0.5 rounded truncate cursor-pointer border",
                            getFollowupColor(f)
                          )}
                          title={`${f.customer_name} - ${f.product_name || ''} @ ${format(new Date(f.followup_at), 'hh:mm a')}`}
                          onClick={() => f.status === 'pending' && handleComplete(f)}
                        >
                          {f.is_a_category && '🔴 '}{format(new Date(f.followup_at), 'HH:mm')} {f.customer_name.split(' ')[0]}
                        </div>
                      ))}
                      {dayFollowups.length > 3 && (
                        <div className="text-[9px] text-muted-foreground text-center">+{dayFollowups.length - 3} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Complete Follow-up Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              Complete Follow-up
            </DialogTitle>
            <DialogDescription>
              {completingFollowup && (
                <span>Mark follow-up with <strong>{completingFollowup.customer_name}</strong> as done</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Remark / Outcome *</label>
              <Textarea
                placeholder="What was discussed? Next steps? Outcome..."
                value={remark}
                onChange={e => setRemark(e.target.value)}
                rows={3}
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCompleteDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitComplete} disabled={completing || !remark.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {completing ? 'Saving...' : '✅ Mark Complete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create / Re-Follow-up Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {prefillFrom ? (
                <>
                  <RefreshCw className="w-5 h-5 text-primary" />
                  Schedule Re-Follow-up
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5 text-primary" />
                  New Follow-up
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {prefillFrom
                ? `Create another follow-up for ${prefillFrom.customer_name}`
                : 'Manually schedule a new follow-up for a customer'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Customer Name *</Label>
                <Input
                  value={newFollowup.customer_name}
                  onChange={e => setNewFollowup(f => ({ ...f, customer_name: e.target.value }))}
                  placeholder="Customer name"
                  className="mt-1 rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs">Company</Label>
                <Input
                  value={newFollowup.customer_company}
                  onChange={e => setNewFollowup(f => ({ ...f, customer_company: e.target.value }))}
                  placeholder="Company name"
                  className="mt-1 rounded-xl"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Phone</Label>
                <Input
                  value={newFollowup.phone}
                  onChange={e => setNewFollowup(f => ({ ...f, phone: e.target.value }))}
                  placeholder="Phone number"
                  className="mt-1 rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input
                  value={newFollowup.email}
                  onChange={e => setNewFollowup(f => ({ ...f, email: e.target.value }))}
                  placeholder="Email address"
                  className="mt-1 rounded-xl"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Product</Label>
                <Input
                  value={newFollowup.product_name}
                  onChange={e => setNewFollowup(f => ({ ...f, product_name: e.target.value }))}
                  placeholder="Product name"
                  className="mt-1 rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs">Source Type</Label>
                <Select value={newFollowup.source_type} onValueChange={(v: any) => setNewFollowup(f => ({ ...f, source_type: v }))}>
                  <SelectTrigger className="mt-1 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prospect">Prospect</SelectItem>
                    <SelectItem value="pipeline">Pipeline</SelectItem>
                    <SelectItem value="enquiry">Enquiry</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Follow-up Date & Time *</Label>
              <Input
                type="datetime-local"
                value={newFollowup.followup_at}
                onChange={e => setNewFollowup(f => ({ ...f, followup_at: e.target.value }))}
                className="mt-1 rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={submitCreate}
              disabled={creating || !newFollowup.customer_name.trim() || !newFollowup.followup_at}
            >
              {creating ? 'Scheduling...' : prefillFrom ? '🔄 Schedule Re-Follow-up' : '📅 Schedule Follow-up'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
