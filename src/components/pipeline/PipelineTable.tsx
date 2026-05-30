import { useState, useEffect, useRef } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CalendarIcon, Trash2, Search, Filter, User, FolderOpen, Flame, Thermometer, Snowflake, Star, X, ArrowUpDown, AlertTriangle, CheckCircle, XCircle, PhoneOutgoing } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, addDays } from 'date-fns';
import { CallButton } from '@/components/calls/CallButton';
import { cn } from '@/lib/utils';
import { PipelineOrder, PIPELINE_STATUSES, PipelineStatus, LeadTemperature, PIPELINE_LOST_REASONS } from '@/hooks/usePipelineOrders';
import { PRODUCT_CATEGORIES } from '@/hooks/useEnquiries';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ProductSelect } from '@/components/ProductSelect';
import { LeadTemperatureBadge, LEAD_TEMPERATURES } from '@/components/LeadTemperatureBadge';
import { OrderForm, OrderFormInitialData } from '@/components/OrderForm';
import { useOrders } from '@/hooks/useOrders';
import { useSuppliers } from '@/hooks/useSuppliers';
import { toast } from 'sonner';
import { LogCallDialog } from '@/components/sales/LogCallDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { FollowupHistory } from '@/components/sales/FollowupHistory';

interface PipelineTableProps {
  orders: PipelineOrder[];
  onUpdate: (id: string, updates: Partial<PipelineOrder>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  statusFilter?: PipelineStatus | 'all';
  onStatusFilterChange?: (status: PipelineStatus | 'all') => void;
  selectedLeadId?: string | null;
}

interface FollowupStats {
  completedCount: number;
  lastCompletedAt: string | null;
}

interface SalesTeamMember {
  user_id: string;
  name: string;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'won': return 'bg-green-500/10 text-green-500 border-green-500/20';
    case 'lost': return 'bg-red-500/10 text-red-500 border-red-500/20';
    case 'negotiation': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    case 'follow_up': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    default: return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
  }
};

const getPriorityBadge = (priority: number | null) => {
  switch (priority) {
    case 1: return <Badge variant="destructive">High</Badge>;
    case 2: return <Badge variant="secondary">Medium</Badge>;
    default: return <Badge variant="outline">Low</Badge>;
  }
};

export function PipelineTable({ orders, onUpdate, onDelete, statusFilter: externalStatusFilter, onStatusFilterChange, selectedLeadId }: PipelineTableProps) {
  const { role } = useAuth();
  const { createOrder } = useOrders();
  const { suppliers } = useSuppliers();
  const [searchTerm, setSearchTerm] = useState('');
  const [internalStatusFilter, setInternalStatusFilter] = useState<PipelineStatus | 'all'>('all');
  const [multiStatusFilter, setMultiStatusFilter] = useState<PipelineStatus[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [salesPersonFilter, setSalesPersonFilter] = useState('all');
  const [leadFilter, setLeadFilter] = useState<'all' | 'hot' | 'warm' | 'cold' | 'mega'>('all');
  const [salesTeam, setSalesTeam] = useState<SalesTeamMember[]>([]);
  const [editOrder, setEditOrder] = useState<PipelineOrder | null>(null);
  const [editClosureDate, setEditClosureDate] = useState<Date | undefined>(undefined);
  const [closureDateStart, setClosureDateStart] = useState<Date | undefined>(undefined);
  const [closureDateEnd, setClosureDateEnd] = useState<Date | undefined>(undefined);
  const [closureSortDir, setClosureSortDir] = useState<'asc' | 'desc' | null>(null);
  const lastAutoOpenedId = useRef<string | null>(null);
  const [orderWonDialog, setOrderWonDialog] = useState<PipelineOrder | null>(null);
  const [logCallOrder, setLogCallOrder] = useState<PipelineOrder | null>(null);
  const [followupStats, setFollowupStats] = useState<Record<string, FollowupStats>>({});

  // Use external filter if provided, otherwise use internal
  const statusFilter = externalStatusFilter ?? internalStatusFilter;
  const setStatusFilter = onStatusFilterChange ?? setInternalStatusFilter;

  useEffect(() => {
    const fetchSalesTeam = async () => {
      const { data, error } = await supabase.rpc('get_sales_team');
      if (!error && data) {
        setSalesTeam(data);
      }
    };
    fetchSalesTeam();
  }, []);

  // Fetch follow-up stats for visible pipeline orders
  useEffect(() => {
    const ids = orders.map(o => o.id);
    if (ids.length === 0) {
      setFollowupStats({});
      return;
    }
    const fetchFollowups = async () => {
      const { data, error } = await supabase
        .from('followups')
        .select('source_id, status, completed_at')
        .eq('source_type', 'pipeline')
        .in('source_id', ids);
      if (error || !data) return;
      const stats: Record<string, FollowupStats> = {};
      for (const row of data as Array<{ source_id: string; status: string; completed_at: string | null }>) {
        if (row.status !== 'completed') continue;
        const cur = stats[row.source_id] || { completedCount: 0, lastCompletedAt: null };
        cur.completedCount += 1;
        if (row.completed_at && (!cur.lastCompletedAt || row.completed_at > cur.lastCompletedAt)) {
          cur.lastCompletedAt = row.completed_at;
        }
        stats[row.source_id] = cur;
      }
      setFollowupStats(stats);
    };
    fetchFollowups();
  }, [orders]);

  // Auto-open lead dialog when selectedLeadId is provided (once per id)
  useEffect(() => {
    if (!selectedLeadId) return;
    if (lastAutoOpenedId.current === selectedLeadId) return;
    if (orders.length === 0) return;

    const targetOrder = orders.find((o) => o.id === selectedLeadId);
    if (!targetOrder) return;

    lastAutoOpenedId.current = selectedLeadId;
    setEditOrder(targetOrder);
    setEditClosureDate(targetOrder.expected_closure_date ? new Date(targetOrder.expected_closure_date) : undefined);
  }, [selectedLeadId, orders]);

  const hasClosureDateFilter = closureDateStart || closureDateEnd;

  const applyClosureDatePreset = (preset: string) => {
    const today = new Date();
    switch (preset) {
      case 'today':
        setClosureDateStart(today);
        setClosureDateEnd(today);
        break;
      case 'this_week':
        setClosureDateStart(startOfWeek(today, { weekStartsOn: 1 }));
        setClosureDateEnd(endOfWeek(today, { weekStartsOn: 1 }));
        break;
      case 'this_month':
        setClosureDateStart(startOfMonth(today));
        setClosureDateEnd(endOfMonth(today));
        break;
      case 'last_month': {
        const lastMonth = subMonths(today, 1);
        setClosureDateStart(startOfMonth(lastMonth));
        setClosureDateEnd(endOfMonth(lastMonth));
        break;
      }
      case 'next_30':
        setClosureDateStart(today);
        setClosureDateEnd(addDays(today, 30));
        break;
    }
  };

  const clearClosureDateFilter = () => {
    setClosureDateStart(undefined);
    setClosureDateEnd(undefined);
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      (order.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
      (order.customer_company?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
      (order.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    const matchesStatus = multiStatusFilter.length > 0
      ? multiStatusFilter.includes(order.status)
      : (statusFilter === 'all' || order.status === statusFilter);
    const matchesCategory = categoryFilter === 'all' || order.product_category === categoryFilter;
    const matchesSalesPerson = salesPersonFilter === 'all' || order.sales_person_id === salesPersonFilter;
    
    // Lead temperature / mega deal filter
    let matchesLead = true;
    if (leadFilter === 'hot') matchesLead = order.lead_temperature === 'hot';
    else if (leadFilter === 'warm') matchesLead = order.lead_temperature === 'warm';
    else if (leadFilter === 'cold') matchesLead = order.lead_temperature === 'cold';
    else if (leadFilter === 'mega') matchesLead = order.is_mega_deal === true;

    // Closure date range filter
    let matchesClosureDate = true;
    if (closureDateStart || closureDateEnd) {
      if (!order.expected_closure_date) {
        matchesClosureDate = false;
      } else {
        const closureDate = order.expected_closure_date;
        if (closureDateStart && closureDate < format(closureDateStart, 'yyyy-MM-dd')) matchesClosureDate = false;
        if (closureDateEnd && closureDate > format(closureDateEnd, 'yyyy-MM-dd')) matchesClosureDate = false;
      }
    }
    
    return matchesSearch && matchesStatus && matchesCategory && matchesSalesPerson && matchesLead && matchesClosureDate;
  });

  // Apply closure date sorting
  const sortedOrders = closureSortDir
    ? [...filteredOrders].sort((a, b) => {
        const dateA = a.expected_closure_date || '';
        const dateB = b.expected_closure_date || '';
        return closureSortDir === 'asc' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
      })
    : filteredOrders;

  const handleEditClick = (order: PipelineOrder) => {
    setEditOrder(order);
    setEditClosureDate(order.expected_closure_date ? new Date(order.expected_closure_date) : undefined);
  };

  const handleEditSave = async () => {
    if (!editOrder) return;
    // Validate lost reason is provided when status is 'lost'
    if (editOrder.status === 'lost' && !editOrder.lost_reason) {
      const { toast } = await import('sonner');
      toast.error('Please select a reason for marking this order as lost');
      return;
    }
    await onUpdate(editOrder.id, {
      ...editOrder,
      expected_closure_date: editClosureDate ? format(editClosureDate, 'yyyy-MM-dd') : null,
      lost_reason: editOrder.status === 'lost' ? editOrder.lost_reason : null,
      lost_reason_notes: editOrder.status === 'lost' ? editOrder.lost_reason_notes : null,
    });
    setEditOrder(null);
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '—';
    return new Intl.NumberFormat('en-IN', { 
      style: 'currency', 
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const isAdminOrSupplyChain = role === 'admin' || role === 'supply_chain' || role === 'sales_manager';
  const canDelete = role === 'admin' || role === 'sales';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline Orders</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customer, company, product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[180px] justify-start h-10 font-normal">
                <Filter className="h-4 w-4 mr-2" />
                {multiStatusFilter.length > 0
                  ? `${multiStatusFilter.length} status${multiStatusFilter.length > 1 ? 'es' : ''}`
                  : statusFilter === 'all'
                    ? 'All Statuses'
                    : PIPELINE_STATUSES.find(s => s.value === statusFilter)?.label || 'Status'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-2" align="start">
              <div className="space-y-1">
                <button
                  type="button"
                  className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted"
                  onClick={() => { setMultiStatusFilter([]); setStatusFilter('all'); }}
                >
                  All Statuses
                </button>
                <div className="border-t my-1" />
                {PIPELINE_STATUSES.map(s => {
                  const checked = multiStatusFilter.includes(s.value as PipelineStatus);
                  return (
                    <label key={s.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setMultiStatusFilter(prev => v
                            ? [...prev, s.value as PipelineStatus]
                            : prev.filter(x => x !== s.value));
                        }}
                      />
                      {s.label}
                    </label>
                  );
                })}
                {multiStatusFilter.length > 0 && (
                  <Button variant="ghost" size="sm" className="w-full text-xs mt-1" onClick={() => setMultiStatusFilter([])}>
                    <X className="h-3 w-3 mr-1" /> Clear
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <FolderOpen className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {PRODUCT_CATEGORIES.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isAdminOrSupplyChain && salesTeam.length > 0 && (
            <Select value={salesPersonFilter} onValueChange={setSalesPersonFilter}>
              <SelectTrigger className="w-[160px]">
                <User className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Sales Person" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sales Persons</SelectItem>
                {salesTeam.map(member => (
                  <SelectItem key={member.user_id} value={member.user_id}>{member.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={leadFilter} onValueChange={(value) => setLeadFilter(value as typeof leadFilter)}>
            <SelectTrigger className="w-[150px]">
              <Flame className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Lead Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Leads</SelectItem>
              <SelectItem value="hot">
                <div className="flex items-center gap-2">
                  <Flame className="h-3.5 w-3.5 text-orange-500" />
                  Hot Leads
                </div>
              </SelectItem>
              <SelectItem value="warm">
                <div className="flex items-center gap-2">
                  <Thermometer className="h-3.5 w-3.5 text-yellow-500" />
                  Warm Leads
                </div>
              </SelectItem>
              <SelectItem value="cold">
                <div className="flex items-center gap-2">
                  <Snowflake className="h-3.5 w-3.5 text-blue-500" />
                  Cold Leads
                </div>
              </SelectItem>
              <SelectItem value="mega">
                <div className="flex items-center gap-2">
                  <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                  Mega Deals
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "justify-start text-left font-normal h-10",
                  hasClosureDateFilter ? "border-primary text-primary" : "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {hasClosureDateFilter
                  ? `${closureDateStart ? format(closureDateStart, 'dd MMM') : '...'} – ${closureDateEnd ? format(closureDateEnd, 'dd MMM') : '...'}`
                  : 'Closure Date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-4" align="start">
              <div className="space-y-3">
                <div className="text-sm font-medium">Quick Presets</div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'Today', value: 'today' },
                    { label: 'This Week', value: 'this_week' },
                    { label: 'This Month', value: 'this_month' },
                    { label: 'Last Month', value: 'last_month' },
                    { label: 'Next 30 Days', value: 'next_30' },
                  ].map((preset) => (
                    <Button
                      key={preset.value}
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => applyClosureDatePreset(preset.value)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <div className="border-t pt-3 space-y-2">
                  <div className="text-sm font-medium">Custom Range</div>
                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn("text-xs h-8 w-[120px]", !closureDateStart && "text-muted-foreground")}>
                          {closureDateStart ? format(closureDateStart, 'dd MMM yyyy') : 'From'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={closureDateStart}
                          onSelect={setClosureDateStart}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                    <span className="text-muted-foreground text-xs">to</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn("text-xs h-8 w-[120px]", !closureDateEnd && "text-muted-foreground")}>
                          {closureDateEnd ? format(closureDateEnd, 'dd MMM yyyy') : 'To'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={closureDateEnd}
                          onSelect={setClosureDateEnd}
                          disabled={(date) => closureDateStart ? date < closureDateStart : false}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                {hasClosureDateFilter && (
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={clearClosureDateFilter}>
                    <X className="h-3 w-3 mr-1" /> Clear Date Filter
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Expected Price</TableHead>
                <TableHead>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-auto p-0 font-medium hover:bg-transparent"
                    onClick={() => setClosureSortDir(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}
                  >
                    Closure Date
                    <ArrowUpDown className={cn("ml-1 h-3.5 w-3.5", closureSortDir && "text-primary")} />
                  </Button>
                </TableHead>
                <TableHead>Status</TableHead>
                {statusFilter === 'lost' && <TableHead>Lost Reason</TableHead>}
                <TableHead>Last Follow-up</TableHead>
                <TableHead className="text-center">Follow-ups</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Sales Person</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                    No pipeline orders found
                  </TableCell>
                </TableRow>
              ) : (
                sortedOrders.map(order => (
                  <TableRow key={order.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleEditClick(order)}>
                    <TableCell>
                      <LeadTemperatureBadge 
                        temperature={order.lead_temperature || "warm"} 
                        isMegaDeal={order.is_mega_deal || false}
                        size="sm"
                      />
                    </TableCell>
                    <TableCell>
                      <LeadSourceBadge source={order.lead_source} size="sm" />
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{order.customer_name}</div>
                        <div className="text-sm text-muted-foreground">{order.customer_company}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{order.product_name}</div>
                        {order.product_code && (
                          <div className="text-sm text-muted-foreground">{order.product_code}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{order.quantity}</TableCell>
                    <TableCell>{formatCurrency(order.expected_price)}</TableCell>
                    <TableCell>
                      {order.expected_closure_date 
                        ? format(new Date(order.expected_closure_date), 'dd MMM yyyy')
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(order.status)}>
                        {PIPELINE_STATUSES.find(s => s.value === order.status)?.label || order.status}
                      </Badge>
                    </TableCell>
                    {statusFilter === 'lost' && (
                      <TableCell>
                        <div className="text-sm">
                          <div className="text-muted-foreground">
                            {PIPELINE_LOST_REASONS.find(r => r.value === order.lost_reason)?.label || order.lost_reason || '—'}
                          </div>
                          {order.lost_reason_notes && (
                            <div className="text-xs text-muted-foreground/70 truncate max-w-[150px]" title={order.lost_reason_notes}>
                              {order.lost_reason_notes}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="text-sm text-muted-foreground">
                      {followupStats[order.id]?.lastCompletedAt
                        ? format(new Date(followupStats[order.id].lastCompletedAt as string), 'dd MMM yyyy')
                        : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{followupStats[order.id]?.completedCount || 0}</Badge>
                    </TableCell>
                    <TableCell>{getPriorityBadge(order.priority)}</TableCell>
                    <TableCell>{order.sales_person_name}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <TooltipProvider>
                          {order.status !== 'won' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-500/10"
                                  onClick={() => setOrderWonDialog(order)}
                                >
                                  <span className="text-xs font-bold">OW</span>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Mark as Order Won</TooltipContent>
                            </Tooltip>
                          )}
                          {order.status !== 'lost' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-500/10"
                                  onClick={() => {
                                    setEditOrder({ ...order, status: 'lost' as PipelineStatus });
                                    setEditClosureDate(order.expected_closure_date ? new Date(order.expected_closure_date) : undefined);
                                  }}
                                >
                                  <span className="text-xs font-bold">OL</span>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Mark as Order Lost</TooltipContent>
                            </Tooltip>
                          )}
                        </TooltipProvider>
                        {order.customer_phone && (
                          <CallButton
                            phoneNumber={order.customer_phone}
                            entityType="pipeline"
                            entityId={order.id}
                            iconOnly
                            variant="ghost"
                            className="h-7 w-7 text-emerald-600 hover:text-emerald-700"
                          />
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:text-primary" onClick={() => setLogCallOrder(order)} title="Log Call">
                          <PhoneOutgoing className="h-3.5 w-3.5" />
                        </Button>
                        {canDelete && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(order.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Edit Dialog */}
        <Dialog open={!!editOrder} onOpenChange={(open) => !open && setEditOrder(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Pipeline Order</DialogTitle>
            </DialogHeader>
            {editOrder && (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Customer Name</Label>
                    <Input
                      value={editOrder.customer_name}
                      onChange={(e) => setEditOrder({...editOrder, customer_name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Company</Label>
                    <Input
                      value={editOrder.customer_company}
                      onChange={(e) => setEditOrder({...editOrder, customer_company: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Product Name</Label>
                    <ProductSelect
                      value={editOrder.product_name}
                      onChange={(value, product) => setEditOrder({
                        ...editOrder, 
                        product_name: value,
                        product_category: product?.product_category || editOrder.product_category,
                      })}
                      placeholder="Search or enter product name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      value={editOrder.quantity}
                      onChange={(e) => setEditOrder({...editOrder, quantity: parseInt(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Expected Price (₹)</Label>
                    <Input
                      type="number"
                      value={editOrder.expected_price || ''}
                      onChange={(e) => setEditOrder({...editOrder, expected_price: e.target.value ? parseFloat(e.target.value) : null})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Expected Closure Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !editClosureDate && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {editClosureDate ? format(editClosureDate, 'PPP') : 'Select date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={editClosureDate}
                          onSelect={setEditClosureDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select 
                      value={editOrder.status} 
                      onValueChange={(v) => setEditOrder({...editOrder, status: v as PipelineStatus})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PIPELINE_STATUSES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select 
                      value={String(editOrder.priority || 3)} 
                      onValueChange={(v) => setEditOrder({...editOrder, priority: parseInt(v)})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">High</SelectItem>
                        <SelectItem value="2">Medium</SelectItem>
                        <SelectItem value="3">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Lead Temperature</Label>
                    <Select 
                      value={editOrder.lead_temperature || 'warm'} 
                      onValueChange={(v) => setEditOrder({...editOrder, lead_temperature: v as LeadTemperature})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEAD_TEMPERATURES.map((temp) => (
                          <SelectItem key={temp.value} value={temp.value}>
                            <div className="flex items-center gap-2">
                              {temp.value === 'hot' && <Flame className="w-4 h-4 text-orange-500" />}
                              {temp.value === 'warm' && <Thermometer className="w-4 h-4 text-yellow-500" />}
                              {temp.value === 'cold' && <Snowflake className="w-4 h-4 text-blue-500" />}
                              {temp.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <Star className={cn(
                        "w-4 h-4",
                        editOrder.is_mega_deal ? "text-amber-500 fill-amber-500" : "text-muted-foreground"
                      )} />
                      <Label htmlFor="mega-deal" className="cursor-pointer">Mega Deal</Label>
                    </div>
                    <Switch 
                      id="mega-deal"
                      checked={editOrder.is_mega_deal || false}
                      onCheckedChange={(checked) => setEditOrder({...editOrder, is_mega_deal: checked})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Customer Notes</Label>
                  <Textarea
                    value={editOrder.customer_notes || ''}
                    onChange={(e) => setEditOrder({...editOrder, customer_notes: e.target.value})}
                    rows={2}
                  />
                </div>
                <FollowupHistory
                  sourceType="pipeline"
                  sourceId={editOrder.id}
                  customerName={editOrder.customer_name}
                  customerCompany={editOrder.customer_company}
                  productName={editOrder.product_name}
                  phone={editOrder.customer_phone}
                  email={editOrder.customer_email}
                />
                {editOrder.status === 'lost' && (
                  <div className="space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                    <div className="text-sm font-medium text-destructive flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Reason for Losing Order (Required)
                    </div>
                    <div className="space-y-2">
                      <Label>Lost Reason *</Label>
                      <Select
                        value={editOrder.lost_reason || ''}
                        onValueChange={(v) => setEditOrder({...editOrder, lost_reason: v})}
                      >
                        <SelectTrigger className={cn(!editOrder.lost_reason && "border-destructive")}>
                          <SelectValue placeholder="Select a reason..." />
                        </SelectTrigger>
                        <SelectContent>
                          {PIPELINE_LOST_REASONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Additional Notes</Label>
                      <Textarea
                        value={editOrder.lost_reason_notes || ''}
                        onChange={(e) => setEditOrder({...editOrder, lost_reason_notes: e.target.value})}
                        placeholder="Any additional details about why this order was lost..."
                        rows={2}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOrder(null)}>Cancel</Button>
              <Button onClick={handleEditSave}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Order Won - Create Order Dialog */}
        <Dialog open={!!orderWonDialog} onOpenChange={(open) => !open && setOrderWonDialog(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Create Order — {orderWonDialog?.customer_name}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[75vh] pr-4">
              {orderWonDialog && (
                <OrderForm
                  embedded
                  onSubmit={async (data, paymentFiles, orderItems, invoiceFile, poFiles) => {
                    const success = await createOrder(data, paymentFiles, orderItems, invoiceFile, poFiles);
                    if (success) {
                      await onUpdate(orderWonDialog.id, { status: 'won' as PipelineStatus });
                      setOrderWonDialog(null);
                      toast.success('Order created and pipeline marked as Won');
                    }
                    return success;
                  }}
                  suppliers={suppliers}
                  userRole={role as any}
                  initialData={{
                    customer_name: orderWonDialog.customer_name,
                    customer_company: orderWonDialog.customer_company,
                    customer_email: orderWonDialog.customer_email || undefined,
                    customer_phone: orderWonDialog.customer_phone || undefined,
                    product_name: orderWonDialog.product_name,
                    product_category: orderWonDialog.product_category || undefined,
                    product_code: orderWonDialog.product_code || undefined,
                    quantity: orderWonDialog.quantity,
                    selling_price: orderWonDialog.expected_price || undefined,
                    total_sales_amount: orderWonDialog.expected_price ? orderWonDialog.expected_price * orderWonDialog.quantity : undefined,
                    sales_person_id: orderWonDialog.sales_person_id,
                    sales_person_name: orderWonDialog.sales_person_name,
                    lead_source: orderWonDialog.lead_source || undefined,
                    customer_notes: orderWonDialog.customer_notes || undefined,
                    internal_notes: orderWonDialog.internal_notes || undefined,
                    source_pipeline_id: orderWonDialog.id,
                  }}
                />
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </CardContent>

      <LogCallDialog
        open={!!logCallOrder}
        onOpenChange={(open) => { if (!open) setLogCallOrder(null); }}
        leadSource="pipeline"
        leadId={logCallOrder?.id || ''}
        leadName={logCallOrder?.customer_name || ''}
        leadPhone={logCallOrder?.customer_phone || ''}
        leadCompany={logCallOrder?.customer_company}
        leadCreatedAt={logCallOrder?.created_at}
      />
    </Card>
  );
}
