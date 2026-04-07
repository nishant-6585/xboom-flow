import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LeadFunnelTracker } from './LeadFunnelTracker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useEnquiries } from '@/hooks/useEnquiries';
import { usePipelineOrders } from '@/hooks/usePipelineOrders';
import { useOrders } from '@/hooks/useOrders';
import { LeadTemperatureBadge } from '@/components/LeadTemperatureBadge';
import { 
  Users, ArrowRight, TrendingUp, CheckCircle2, 
  XCircle, Clock, Target, Package, Zap, Building2, ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';

interface DetailItem {
  id: string;
  type: 'pipeline' | 'enquiry' | 'order';
  customer_name: string;
  customer_company: string;
  product_name: string;
  value: number;
  date: string;
  status: string;
  temperature?: string;
  tab?: string;
}

const formatCurrency = (value: number) => {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
  return `₹${value.toFixed(0)}`;
};

export function SalesFunnelDashboard() {
  const [, setSearchParams] = useSearchParams();
  const { enquiries, loading: enquiriesLoading } = useEnquiries();
  const { pipelineOrders, loading: pipelineLoading } = usePipelineOrders();
  const { orders, loading: ordersLoading } = useOrders();

  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogItems, setDialogItems] = useState<DetailItem[]>([]);

  const openDrillDown = useCallback((title: string, items: DetailItem[]) => {
    setDialogTitle(title);
    setDialogItems(items);
    setDetailDialogOpen(true);
  }, []);

  const handleItemClick = useCallback((item: DetailItem) => {
    setDetailDialogOpen(false);
    const tabMap: Record<string, string> = { enquiry: 'enquiries', pipeline: 'pipeline', order: 'orders_won' };
    const tabValue = tabMap[item.type];
    if (tabValue) {
      setTimeout(() => {
        setSearchParams(prev => {
          const params = new URLSearchParams(prev);
          params.set('tab', tabValue);
          if (item.id) params.set('leadId', item.id);
          return params;
        });
      }, 150);
    }
  }, [setSearchParams]);

  const loading = enquiriesLoading || pipelineLoading || ordersLoading;

  // Calculate funnel metrics
  const totalLeads = enquiries.length;
  const pendingEnquiries = enquiries.filter(e => e.status === 'pending');
  const respondedEnquiries = enquiries.filter(e => e.status === 'responded');
  const onHoldEnquiries = enquiries.filter(e => e.status === 'on_hold');
  const movedToPipeline = enquiries.filter(e => e.status === 'moved_to_pipeline');
  const enquiryWon = enquiries.filter(e => e.status === 'order_won');
  const enquiryLost = enquiries.filter(e => e.status === 'order_lost');
  
  // Pipeline metrics
  const totalPipeline = pipelineOrders.length;
  const pipelinePending = pipelineOrders.filter(p => p.status === 'pending_confirmation');
  const pipelineNegotiation = pipelineOrders.filter(p => p.status === 'negotiation');
  const pipelineWon = pipelineOrders.filter(p => p.status === 'won');
  const pipelineLost = pipelineOrders.filter(p => p.status === 'lost');
  const pipelineValue = pipelineOrders.reduce((sum, p) => sum + (p.expected_price || 0), 0);
  
  // Order metrics
  const totalOrders = orders.length;
  const ordersPoReceived = orders.filter(o => o.status === 'po_received');
  const ordersPaymentReceived = orders.filter(o => o.status === 'payment_received' || o.status === 'partial_payment_received');
  const ordersProcurement = orders.filter(o => 
    o.status === 'procurement_to_plan' || 
    o.status === 'procurement_in_process' || 
    o.status === 'procurement_done'
  );
  const ordersDelivered = orders.filter(o => o.status === 'delivery_done');
  const ordersCancelled = orders.filter(o => o.status === 'cancelled');
  const ordersRTO = orders.filter(o => o.is_rto);
  const ordersValue = orders.reduce((sum, o) => sum + (o.total_sales_amount || 0), 0);

  // Conversion rates
  const enquiryToQualified = totalLeads > 0 
    ? ((movedToPipeline.length + enquiryWon.length) / totalLeads * 100).toFixed(1)
    : '0';
  const pipelineToOrder = totalPipeline > 0 
    ? ((pipelineWon.length + enquiryWon.length) / totalPipeline * 100).toFixed(1)
    : '0';
  const orderDeliveryRate = totalOrders > 0 
    ? (ordersDelivered.length / totalOrders * 100).toFixed(1)
    : '0';

  // Helpers to create detail items
  const enquiryToDetail = (e: any): DetailItem => ({
    id: e.id, type: 'enquiry', customer_name: e.customer_name, customer_company: e.customer_company,
    product_name: e.product_name, value: e.quantity || 0, date: e.created_at, status: e.status, temperature: e.lead_temperature, tab: 'enquiries',
  });
  const pipelineToDetail = (p: any): DetailItem => ({
    id: p.id, type: 'pipeline', customer_name: p.customer_name, customer_company: p.customer_company,
    product_name: p.product_name, value: p.expected_price || 0, date: p.created_at, status: p.status, temperature: p.lead_temperature, tab: 'pipeline',
  });
  const orderToDetail = (o: any): DetailItem => ({
    id: o.id, type: 'order', customer_name: o.customer_name || o.party_name || 'N/A', customer_company: o.customer_company || '',
    product_name: o.product_name || o.item_name || '', value: o.total_sales_amount || 0, date: o.order_date || o.created_at, status: o.status, tab: 'orders_won',
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-muted animate-pulse rounded-lg" />
        <div className="h-48 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Lead Funnel Tracker */}
      <LeadFunnelTracker />

      {/* Flow Header */}
      <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-primary/70">
              <Zap className="w-8 h-8 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Sales Conversion Funnel</h2>
              <p className="text-muted-foreground">
                Leads → Enquiry → Pipeline → Order → Delivery
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Visual Funnel Flow */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Stage 1: Leads/Enquiries */}
        <Card
          className="relative overflow-hidden border-2 border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-500/5 cursor-pointer hover:shadow-lg transition-all"
          onClick={() => openDrillDown(`All Enquiries (${totalLeads})`, enquiries.slice(0, 100).map(enquiryToDetail))}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500" />
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-blue-700">
              <Users className="w-5 h-5" />
              LEADS / ENQUIRIES
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-4xl font-bold text-blue-600">{totalLeads}</div>
            <div className="space-y-1 text-sm">
              <div
                className="flex justify-between cursor-pointer hover:bg-blue-500/10 rounded px-1 -mx-1 transition-colors"
                onClick={(e) => { e.stopPropagation(); openDrillDown(`Pending Enquiries (${pendingEnquiries.length})`, pendingEnquiries.map(enquiryToDetail)); }}
              >
                <span className="text-muted-foreground">Pending</span>
                <Badge className="bg-yellow-500/20 text-yellow-700">{pendingEnquiries.length}</Badge>
              </div>
              <div
                className="flex justify-between cursor-pointer hover:bg-blue-500/10 rounded px-1 -mx-1 transition-colors"
                onClick={(e) => { e.stopPropagation(); openDrillDown(`Responded Enquiries (${respondedEnquiries.length})`, respondedEnquiries.map(enquiryToDetail)); }}
              >
                <span className="text-muted-foreground">Responded</span>
                <Badge className="bg-purple-500/20 text-purple-700">{respondedEnquiries.length}</Badge>
              </div>
              <div
                className="flex justify-between cursor-pointer hover:bg-blue-500/10 rounded px-1 -mx-1 transition-colors"
                onClick={(e) => { e.stopPropagation(); openDrillDown(`On Hold Enquiries (${onHoldEnquiries.length})`, onHoldEnquiries.map(enquiryToDetail)); }}
              >
                <span className="text-muted-foreground">On Hold</span>
                <Badge className="bg-gray-500/20 text-gray-700">{onHoldEnquiries.length}</Badge>
              </div>
            </div>
          </CardContent>
          <div className="absolute -right-2 top-1/2 -translate-y-1/2 hidden md:block">
            <ArrowRight className="w-6 h-6 text-blue-500" />
          </div>
        </Card>

        {/* Stage 2: Pipeline */}
        <Card
          className="relative overflow-hidden border-2 border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 cursor-pointer hover:shadow-lg transition-all"
          onClick={() => openDrillDown(`All Pipeline (${totalPipeline})`, pipelineOrders.slice(0, 100).map(pipelineToDetail))}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500" />
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-indigo-700">
              <Target className="w-5 h-5" />
              PIPELINE
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-4xl font-bold text-indigo-600">{totalPipeline}</div>
            <div className="space-y-1 text-sm">
              <div
                className="flex justify-between cursor-pointer hover:bg-indigo-500/10 rounded px-1 -mx-1 transition-colors"
                onClick={(e) => { e.stopPropagation(); openDrillDown(`Pending Confirmation (${pipelinePending.length})`, pipelinePending.map(pipelineToDetail)); }}
              >
                <span className="text-muted-foreground">Pending Confirm</span>
                <Badge className="bg-yellow-500/20 text-yellow-700">{pipelinePending.length}</Badge>
              </div>
              <div
                className="flex justify-between cursor-pointer hover:bg-indigo-500/10 rounded px-1 -mx-1 transition-colors"
                onClick={(e) => { e.stopPropagation(); openDrillDown(`Negotiation (${pipelineNegotiation.length})`, pipelineNegotiation.map(pipelineToDetail)); }}
              >
                <span className="text-muted-foreground">Negotiation</span>
                <Badge className="bg-blue-500/20 text-blue-700">{pipelineNegotiation.length}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Value</span>
                <span className="font-medium text-indigo-600">₹{(pipelineValue / 100000).toFixed(1)}L</span>
              </div>
            </div>
          </CardContent>
          <div className="absolute -right-2 top-1/2 -translate-y-1/2 hidden md:block">
            <ArrowRight className="w-6 h-6 text-indigo-500" />
          </div>
        </Card>

        {/* Stage 3: Orders */}
        <Card
          className="relative overflow-hidden border-2 border-green-500/30 bg-gradient-to-br from-green-500/10 to-green-500/5 cursor-pointer hover:shadow-lg transition-all"
          onClick={() => openDrillDown(`All Orders (${totalOrders})`, orders.slice(0, 100).map(orderToDetail))}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-green-500" />
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-green-700">
              <Package className="w-5 h-5" />
              ORDERS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-4xl font-bold text-green-600">{totalOrders}</div>
            <div className="space-y-1 text-sm">
              <div
                className="flex justify-between cursor-pointer hover:bg-green-500/10 rounded px-1 -mx-1 transition-colors"
                onClick={(e) => { e.stopPropagation(); openDrillDown(`PO Received (${ordersPoReceived.length})`, ordersPoReceived.map(orderToDetail)); }}
              >
                <span className="text-muted-foreground">PO Received</span>
                <Badge className="bg-blue-500/20 text-blue-700">{ordersPoReceived.length}</Badge>
              </div>
              <div
                className="flex justify-between cursor-pointer hover:bg-green-500/10 rounded px-1 -mx-1 transition-colors"
                onClick={(e) => { e.stopPropagation(); openDrillDown(`Payment Received (${ordersPaymentReceived.length})`, ordersPaymentReceived.map(orderToDetail)); }}
              >
                <span className="text-muted-foreground">Payment In</span>
                <Badge className="bg-green-500/20 text-green-700">{ordersPaymentReceived.length}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Value</span>
                <span className="font-medium text-green-600">₹{(ordersValue / 100000).toFixed(1)}L</span>
              </div>
            </div>
          </CardContent>
          <div className="absolute -right-2 top-1/2 -translate-y-1/2 hidden md:block">
            <ArrowRight className="w-6 h-6 text-green-500" />
          </div>
        </Card>

        {/* Stage 4: Delivered */}
        <Card
          className="relative overflow-hidden border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 cursor-pointer hover:shadow-lg transition-all"
          onClick={() => openDrillDown(`Delivered Orders (${ordersDelivered.length})`, ordersDelivered.map(orderToDetail))}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="w-5 h-5" />
              DELIVERED
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-4xl font-bold text-emerald-600">{ordersDelivered.length}</div>
            <div className="space-y-1 text-sm">
              <div
                className="flex justify-between cursor-pointer hover:bg-emerald-500/10 rounded px-1 -mx-1 transition-colors"
                onClick={(e) => { e.stopPropagation(); openDrillDown(`In Procurement (${ordersProcurement.length})`, ordersProcurement.map(orderToDetail)); }}
              >
                <span className="text-muted-foreground">In Procurement</span>
                <Badge className="bg-orange-500/20 text-orange-700">{ordersProcurement.length}</Badge>
              </div>
              <div
                className="flex justify-between cursor-pointer hover:bg-emerald-500/10 rounded px-1 -mx-1 transition-colors"
                onClick={(e) => { e.stopPropagation(); openDrillDown(`Cancelled Orders (${ordersCancelled.length})`, ordersCancelled.map(orderToDetail)); }}
              >
                <span className="text-muted-foreground">Cancelled</span>
                <Badge className="bg-red-500/20 text-red-700">{ordersCancelled.length}</Badge>
              </div>
              <div
                className="flex justify-between cursor-pointer hover:bg-emerald-500/10 rounded px-1 -mx-1 transition-colors"
                onClick={(e) => { e.stopPropagation(); openDrillDown(`RTO Orders (${ordersRTO.length})`, ordersRTO.map(orderToDetail)); }}
              >
                <span className="text-muted-foreground">RTO</span>
                <Badge className="bg-gray-500/20 text-gray-700">{ordersRTO.length}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Conversion Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border-blue-500/20 cursor-pointer hover:shadow-lg transition-all"
          onClick={() => openDrillDown(`Qualified Enquiries (${movedToPipeline.length + enquiryWon.length})`, [...movedToPipeline, ...enquiryWon].map(enquiryToDetail))}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Enquiry → Pipeline Rate</p>
                <p className="text-3xl font-bold text-blue-600">{enquiryToQualified}%</p>
              </div>
              <div className="p-3 rounded-full bg-blue-500/20">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {movedToPipeline.length + enquiryWon.length} of {totalLeads} enquiries qualified
            </p>
          </CardContent>
        </Card>

        <Card
          className="bg-gradient-to-r from-indigo-500/10 to-green-500/10 border-indigo-500/20 cursor-pointer hover:shadow-lg transition-all"
          onClick={() => openDrillDown(`Pipeline Won (${pipelineWon.length})`, pipelineWon.map(pipelineToDetail))}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pipeline → Order Rate</p>
                <p className="text-3xl font-bold text-indigo-600">{pipelineToOrder}%</p>
              </div>
              <div className="p-3 rounded-full bg-indigo-500/20">
                <Target className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {pipelineWon.length + enquiryWon.length} of {totalPipeline} pipeline converted
            </p>
          </CardContent>
        </Card>

        <Card
          className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/20 cursor-pointer hover:shadow-lg transition-all"
          onClick={() => openDrillDown(`Delivered Orders (${ordersDelivered.length})`, ordersDelivered.map(orderToDetail))}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Order Delivery Rate</p>
                <p className="text-3xl font-bold text-green-600">{orderDeliveryRate}%</p>
              </div>
              <div className="p-3 rounded-full bg-green-500/20">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {ordersDelivered.length} of {totalOrders} orders delivered
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Won/Lost Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-green-500/30 cursor-pointer hover:shadow-lg transition-all"
          onClick={() => openDrillDown(`Won Summary — Enquiries (${enquiryWon.length}) + Pipeline (${pipelineWon.length})`, [
            ...enquiryWon.map(enquiryToDetail),
            ...pipelineWon.map(pipelineToDetail),
          ])}
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="w-5 h-5" />
              Won Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-green-500/10">
                <p className="text-sm text-muted-foreground">From Enquiries</p>
                <p className="text-2xl font-bold text-green-600">{enquiryWon.length}</p>
              </div>
              <div className="p-3 rounded-lg bg-green-500/10">
                <p className="text-sm text-muted-foreground">From Pipeline</p>
                <p className="text-2xl font-bold text-green-600">{pipelineWon.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-500/30 cursor-pointer hover:shadow-lg transition-all"
          onClick={() => openDrillDown(`Lost Summary — Enquiries (${enquiryLost.length}) + Pipeline (${pipelineLost.length})`, [
            ...enquiryLost.map(enquiryToDetail),
            ...pipelineLost.map(pipelineToDetail),
          ])}
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="w-5 h-5" />
              Lost Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-red-500/10">
                <p className="text-sm text-muted-foreground">Enquiries Lost</p>
                <p className="text-2xl font-bold text-red-600">{enquiryLost.length}</p>
              </div>
              <div className="p-3 rounded-lg bg-red-500/10">
                <p className="text-sm text-muted-foreground">Pipeline Lost</p>
                <p className="text-2xl font-bold text-red-600">{pipelineLost.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Visibility Notice */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Data Visibility:</p>
              <ul className="space-y-1">
                <li>• <strong>Sales:</strong> View own enquiries, pipeline & orders only</li>
                <li>• <strong>Supply Chain:</strong> View all enquiries, pipeline & orders</li>
                <li>• <strong>Admin:</strong> Full access to all data with delete permissions</li>
                <li>• <strong>Finance:</strong> View all orders for payment tracking</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Drill-Down Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            {dialogItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No items found</div>
            ) : (
              <div className="space-y-2">
                {dialogItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer group"
                    onClick={() => handleItemClick(item)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate">{item.customer_name}</span>
                        <Badge variant="outline" className="text-xs shrink-0">{item.status}</Badge>
                        {item.temperature && <LeadTemperatureBadge temperature={item.temperature as any} showLabel={false} size="sm" />}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {item.customer_company && (
                          <>
                            <Building2 className="w-3 h-3" />
                            <span className="truncate">{item.customer_company}</span>
                            <span>•</span>
                          </>
                        )}
                        <span className="truncate">{item.product_name || '—'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <div className="text-right">
                        {item.value > 0 && <p className="font-semibold text-primary">{formatCurrency(item.value)}</p>}
                        <p className="text-xs text-muted-foreground">
                          {item.date ? format(new Date(item.date), 'dd MMM yyyy') : '—'}
                        </p>
                      </div>
                      <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
