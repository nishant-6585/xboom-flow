import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCallbacks, MissedCallback } from '@/hooks/useCallbacks';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { format, isToday, isBefore, differenceInHours } from 'date-fns';
import { Phone, PhoneOff, Search, CheckCircle2, User, RefreshCw, AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AssigneeCell } from './AssigneeCell';
import { LinkToCompanyButton } from './LinkToCompanyButton';

interface SalesProfile {
  user_id: string;
  name: string;
}

export function CallbacksPanel() {
  const { callbacks, loading, completeCallback, reassignCallback, cancelCallback, createCallback } = useCallbacks();
  const { user, role } = useAuth();
  const isManager = role === 'admin' || role === 'sales_manager';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [selectedCallback, setSelectedCallback] = useState<MissedCallback | null>(null);
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [salesTeam, setSalesTeam] = useState<SalesProfile[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState('');

  // Fetch sales team for reassignment
  useEffect(() => {
    const fetchTeam = async () => {
      const { data } = await supabase.rpc('get_sales_team');
      if (data) setSalesTeam(data as SalesProfile[]);
    };
    fetchTeam();
  }, []);

  // Auto-create callbacks from missed calls (for managers)
  const syncMissedCalls = async () => {
    try {
      // Get recent missed calls that don't have callbacks yet
      const { data: missedCalls } = await supabase
        .from('call_logs')
        .select('*')
        .eq('call_status', 'missed')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!missedCalls || missedCalls.length === 0) return;

      // Get existing callback call_log_ids
      const { data: existingCallbacks } = await supabase
        .from('missed_call_callbacks')
        .select('call_log_id');

      const existingIds = new Set((existingCallbacks || []).map(c => (c as any).call_log_id));

      // Round-robin between available sales team
      const defaultAssignees = salesTeam.length > 0 ? salesTeam : [];
      let assigneeIndex = 0;

      for (const call of missedCalls) {
        if (existingIds.has(call.id)) continue;

        const assignee = defaultAssignees.length > 0
          ? defaultAssignees[assigneeIndex % defaultAssignees.length]
          : null;

        await createCallback({
          call_log_id: call.id,
          caller_number: call.caller_number || call.full_number || 'Unknown',
          customer_name: call.customer_name,
          customer_company: call.customer_company,
          product_name: call.product_name,
          city: call.city,
          assigned_to: assignee?.user_id || null,
          assigned_to_name: assignee?.name || null,
          priority: call.is_a_category ? 'high' : 'normal',
          call_time: call.start_time || call.created_at,
        });

        assigneeIndex++;
      }
    } catch (error) {
      console.error('Error syncing missed calls:', error);
    }
  };

  const filtered = useMemo(() => {
    let items = callbacks;
    if (statusFilter === 'pending') items = items.filter(c => c.status === 'pending');
    else if (statusFilter === 'completed') items = items.filter(c => c.status === 'completed');
    else if (statusFilter === 'today') items = items.filter(c => isToday(new Date(c.call_time)));

    if (search) {
      const q = search.toLowerCase();
      items = items.filter(c =>
        c.caller_number?.toLowerCase().includes(q) ||
        c.customer_name?.toLowerCase().includes(q) ||
        c.customer_company?.toLowerCase().includes(q) ||
        c.assigned_to_name?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [callbacks, statusFilter, search]);

  // Stats
  const pendingCount = callbacks.filter(c => c.status === 'pending').length;
  const todayPending = callbacks.filter(c => c.status === 'pending' && isToday(new Date(c.call_time))).length;
  const completedToday = callbacks.filter(c => c.status === 'completed' && c.completed_at && isToday(new Date(c.completed_at))).length;
  const highPriority = callbacks.filter(c => c.status === 'pending' && c.priority === 'high').length;

  const handleComplete = (cb: MissedCallback) => {
    setSelectedCallback(cb);
    setRemark('');
    setCompleteDialogOpen(true);
  };

  const handleReassign = (cb: MissedCallback) => {
    setSelectedCallback(cb);
    setSelectedAssignee('');
    setReassignDialogOpen(true);
  };

  const submitComplete = async () => {
    if (!selectedCallback || !remark.trim()) return;
    setSubmitting(true);
    await completeCallback(selectedCallback.id, remark.trim());
    setSubmitting(false);
    setCompleteDialogOpen(false);
  };

  const submitReassign = async () => {
    if (!selectedCallback || !selectedAssignee) return;
    const person = salesTeam.find(s => s.user_id === selectedAssignee);
    if (!person) return;
    setSubmitting(true);
    await reassignCallback(selectedCallback.id, person.user_id, person.name);
    setSubmitting(false);
    setReassignDialogOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-3">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{pendingCount}</div>
            <div className="text-xs text-muted-foreground">Pending Callbacks</div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-3">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{todayPending}</div>
            <div className="text-xs text-muted-foreground">Today's Missed</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-3">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{completedToday}</div>
            <div className="text-xs text-muted-foreground">Called Back Today</div>
          </CardContent>
        </Card>
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-3">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{highPriority}</div>
            <div className="text-xs text-muted-foreground">High Priority</div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by number, name..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 rounded-xl" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] h-9 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        {isManager && (
          <Button variant="outline" size="sm" className="h-9 rounded-xl" onClick={syncMissedCalls}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Sync Missed Calls
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Priority</TableHead>
                <TableHead>Caller</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Missed At</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <PhoneOff className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No callbacks found
                  </TableCell>
                </TableRow>
              )}
              {filtered.map(cb => {
                const hoursAgo = differenceInHours(new Date(), new Date(cb.call_time));
                return (
                  <TableRow key={cb.id} className={cn(
                    "transition-colors",
                    cb.status === 'completed' && "opacity-60",
                    cb.priority === 'high' && cb.status === 'pending' && "bg-red-500/5"
                  )}>
                    <TableCell>
                      {cb.status === 'completed' ? (
                        <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-0 text-[10px]">✅ Done</Badge>
                      ) : cb.priority === 'high' ? (
                        <Badge className="bg-red-500/20 text-red-700 dark:text-red-400 border-0 text-[10px] animate-pulse">🔴 High</Badge>
                      ) : hoursAgo > 4 && cb.status === 'pending' ? (
                        <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-400 border-0 text-[10px]">⚠️ Overdue</Badge>
                      ) : (
                        <Badge className="bg-primary/15 text-primary border-0 text-[10px]">Normal</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                        {cb.caller_number}
                      </div>
                      {cb.customer_name && <div className="text-xs text-muted-foreground">{cb.customer_name}</div>}
                    </TableCell>
                    <TableCell className="text-sm">{cb.customer_company || '—'}</TableCell>
                    <TableCell>
                      {cb.customer_company && <div className="text-xs">{cb.customer_company}</div>}
                      {cb.product_name && <div className="text-[10px] text-muted-foreground">{cb.product_name}</div>}
                      {cb.city && <div className="text-[10px] text-muted-foreground">{cb.city}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{format(new Date(cb.call_time), 'dd MMM, HH:mm')}</div>
                      <div className="text-[10px] text-muted-foreground">{hoursAgo}h ago</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <AssigneeCell userId={(cb as any).assigned_to} name={cb.assigned_to_name} />
                        <LinkToCompanyButton lead={{ customer_name: cb.customer_name, company: cb.customer_company, phone: cb.caller_number, city: cb.city, source_label: 'Callback' }} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {cb.status === 'pending' && (
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10" onClick={() => handleComplete(cb)}>
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Done
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs rounded-lg" onClick={() => handleReassign(cb)}>
                            <ArrowRightLeft className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                      {cb.status === 'completed' && cb.remark && (
                        <span className="text-xs text-muted-foreground italic">"{cb.remark}"</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Complete Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              Complete Callback
            </DialogTitle>
            <DialogDescription>
              {selectedCallback && <span>Mark callback to <strong>{selectedCallback.caller_number}</strong> as done</span>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Textarea placeholder="What was discussed? Outcome..." value={remark} onChange={e => setRemark(e.target.value)} rows={3} className="rounded-xl" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCompleteDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitComplete} disabled={submitting || !remark.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {submitting ? 'Saving...' : '✅ Mark Complete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassign Dialog */}
      <Dialog open={reassignDialogOpen} onOpenChange={setReassignDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-primary" />
              Reassign Callback
            </DialogTitle>
            <DialogDescription>
              Assign this callback to another team member
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Select value={selectedAssignee} onValueChange={setSelectedAssignee}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Select team member" />
              </SelectTrigger>
              <SelectContent>
                {salesTeam.map(s => (
                  <SelectItem key={s.user_id} value={s.user_id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReassignDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitReassign} disabled={submitting || !selectedAssignee}>
              {submitting ? 'Assigning...' : 'Reassign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
