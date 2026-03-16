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
import { CalendarIcon, Edit, Trash2, Search, Filter, User, FolderOpen, Flame, Thermometer, Snowflake, Star, X, ArrowUpDown } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { PipelineOrder, PIPELINE_STATUSES, PipelineStatus, LeadTemperature } from '@/hooks/usePipelineOrders';
import { PRODUCT_CATEGORIES } from '@/hooks/useEnquiries';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ProductSelect } from '@/components/ProductSelect';
import { LeadTemperatureBadge, LEAD_TEMPERATURES } from '@/components/LeadTemperatureBadge';

interface PipelineTableProps {
  orders: PipelineOrder[];
  onUpdate: (id: string, updates: Partial<PipelineOrder>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  statusFilter?: PipelineStatus | 'all';
  onStatusFilterChange?: (status: PipelineStatus | 'all') => void;
  selectedLeadId?: string | null;
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
  const [searchTerm, setSearchTerm] = useState('');
  const [internalStatusFilter, setInternalStatusFilter] = useState<PipelineStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [salesPersonFilter, setSalesPersonFilter] = useState('all');
  const [leadFilter, setLeadFilter] = useState<'all' | 'hot' | 'warm' | 'cold' | 'mega'>('all');
  const [salesTeam, setSalesTeam] = useState<SalesTeamMember[]>([]);
  const [editOrder, setEditOrder] = useState<PipelineOrder | null>(null);
  const [editClosureDate, setEditClosureDate] = useState<Date | undefined>(undefined);
  const lastAutoOpenedId = useRef<string | null>(null);

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

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer_company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.product_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || order.product_category === categoryFilter;
    const matchesSalesPerson = salesPersonFilter === 'all' || order.sales_person_id === salesPersonFilter;
    
    // Lead temperature / mega deal filter
    let matchesLead = true;
    if (leadFilter === 'hot') matchesLead = order.lead_temperature === 'hot';
    else if (leadFilter === 'warm') matchesLead = order.lead_temperature === 'warm';
    else if (leadFilter === 'cold') matchesLead = order.lead_temperature === 'cold';
    else if (leadFilter === 'mega') matchesLead = order.is_mega_deal === true;
    
    return matchesSearch && matchesStatus && matchesCategory && matchesSalesPerson && matchesLead;
  });

  const handleEditClick = (order: PipelineOrder) => {
    setEditOrder(order);
    setEditClosureDate(order.expected_closure_date ? new Date(order.expected_closure_date) : undefined);
  };

  const handleEditSave = async () => {
    if (!editOrder) return;
    await onUpdate(editOrder.id, {
      ...editOrder,
      expected_closure_date: editClosureDate ? format(editClosureDate, 'yyyy-MM-dd') : null,
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
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as PipelineStatus | 'all')}>
            <SelectTrigger className="w-[160px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {PIPELINE_STATUSES.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Expected Price</TableHead>
                <TableHead>Closure Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Sales Person</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    No pipeline orders found
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map(order => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <LeadTemperatureBadge 
                        temperature={order.lead_temperature || "warm"} 
                        isMegaDeal={order.is_mega_deal || false}
                        size="sm"
                      />
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
                    <TableCell>{getPriorityBadge(order.priority)}</TableCell>
                    <TableCell>{order.sales_person_name}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEditClick(order)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        {canDelete && (
                          <Button variant="ghost" size="icon" onClick={() => onDelete(order.id)}>
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
          <DialogContent className="max-w-2xl">
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
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOrder(null)}>Cancel</Button>
              <Button onClick={handleEditSave}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
