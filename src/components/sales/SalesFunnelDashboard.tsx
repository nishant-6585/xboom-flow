import { LeadFunnelTracker } from './LeadFunnelTracker';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useEnquiries } from '@/hooks/useEnquiries';
import { usePipelineOrders } from '@/hooks/usePipelineOrders';
import { useOrders } from '@/hooks/useOrders';
import { 
  Users, ArrowRight, ArrowDown, TrendingUp, CheckCircle2, 
  XCircle, Clock, Target, DollarSign, Package, Zap
} from 'lucide-react';

export function SalesFunnelDashboard() {
  const { enquiries, loading: enquiriesLoading } = useEnquiries();
  const { pipelineOrders, loading: pipelineLoading } = usePipelineOrders();
  const { orders, loading: ordersLoading } = useOrders();

  const loading = enquiriesLoading || pipelineLoading || ordersLoading;

  // Calculate funnel metrics
  const totalLeads = enquiries.length;
  const pendingEnquiries = enquiries.filter(e => e.status === 'pending').length;
  const respondedEnquiries = enquiries.filter(e => e.status === 'responded').length;
  const movedToPipeline = enquiries.filter(e => e.status === 'moved_to_pipeline').length;
  const enquiryWon = enquiries.filter(e => e.status === 'order_won').length;
  const enquiryLost = enquiries.filter(e => e.status === 'order_lost').length;
  
  // Pipeline metrics
  const totalPipeline = pipelineOrders.length;
  const pipelinePending = pipelineOrders.filter(p => p.status === 'pending_confirmation').length;
  const pipelineNegotiation = pipelineOrders.filter(p => p.status === 'negotiation').length;
  const pipelineWon = pipelineOrders.filter(p => p.status === 'won').length;
  const pipelineLost = pipelineOrders.filter(p => p.status === 'lost').length;
  const pipelineValue = pipelineOrders.reduce((sum, p) => sum + (p.expected_price || 0), 0);
  
  // Order metrics
  const totalOrders = orders.length;
  const ordersPoReceived = orders.filter(o => o.status === 'po_received').length;
  const ordersPaymentReceived = orders.filter(o => o.status === 'payment_received' || o.status === 'partial_payment_received').length;
  const ordersProcurement = orders.filter(o => 
    o.status === 'procurement_to_plan' || 
    o.status === 'procurement_in_process' || 
    o.status === 'procurement_done'
  ).length;
  const ordersDelivered = orders.filter(o => o.status === 'delivery_done').length;
  const ordersCancelled = orders.filter(o => o.status === 'cancelled').length;
  const ordersValue = orders.reduce((sum, o) => sum + (o.total_sales_amount || 0), 0);

  // Conversion rates
  const enquiryToQualified = totalLeads > 0 
    ? ((movedToPipeline + enquiryWon) / totalLeads * 100).toFixed(1)
    : '0';
  const pipelineToOrder = totalPipeline > 0 
    ? ((pipelineWon + enquiryWon) / totalPipeline * 100).toFixed(1)
    : '0';
  const orderDeliveryRate = totalOrders > 0 
    ? (ordersDelivered / totalOrders * 100).toFixed(1)
    : '0';

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
        <Card className="relative overflow-hidden border-2 border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
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
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pending</span>
                <Badge className="bg-yellow-500/20 text-yellow-700">{pendingEnquiries}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Responded</span>
                <Badge className="bg-purple-500/20 text-purple-700">{respondedEnquiries}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">On Hold</span>
                <Badge className="bg-gray-500/20 text-gray-700">
                  {enquiries.filter(e => e.status === 'on_hold').length}
                </Badge>
              </div>
            </div>
          </CardContent>
          <div className="absolute -right-2 top-1/2 -translate-y-1/2 hidden md:block">
            <ArrowRight className="w-6 h-6 text-blue-500" />
          </div>
        </Card>

        {/* Stage 2: Pipeline */}
        <Card className="relative overflow-hidden border-2 border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 to-indigo-500/5">
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
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pending Confirm</span>
                <Badge className="bg-yellow-500/20 text-yellow-700">{pipelinePending}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Negotiation</span>
                <Badge className="bg-blue-500/20 text-blue-700">{pipelineNegotiation}</Badge>
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
        <Card className="relative overflow-hidden border-2 border-green-500/30 bg-gradient-to-br from-green-500/10 to-green-500/5">
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
              <div className="flex justify-between">
                <span className="text-muted-foreground">PO Received</span>
                <Badge className="bg-blue-500/20 text-blue-700">{ordersPoReceived}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment In</span>
                <Badge className="bg-green-500/20 text-green-700">{ordersPaymentReceived}</Badge>
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
        <Card className="relative overflow-hidden border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5">
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="w-5 h-5" />
              DELIVERED
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-4xl font-bold text-emerald-600">{ordersDelivered}</div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">In Procurement</span>
                <Badge className="bg-orange-500/20 text-orange-700">{ordersProcurement}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cancelled</span>
                <Badge className="bg-red-500/20 text-red-700">{ordersCancelled}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">RTO</span>
                <Badge className="bg-gray-500/20 text-gray-700">
                  {orders.filter(o => o.is_rto).length}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Conversion Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border-blue-500/20">
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
              {movedToPipeline + enquiryWon} of {totalLeads} enquiries qualified
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-indigo-500/10 to-green-500/10 border-indigo-500/20">
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
              {pipelineWon + enquiryWon} of {totalPipeline} pipeline converted
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/20">
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
              {ordersDelivered} of {totalOrders} orders delivered
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Won/Lost Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-green-500/30">
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
                <p className="text-2xl font-bold text-green-600">{enquiryWon}</p>
              </div>
              <div className="p-3 rounded-lg bg-green-500/10">
                <p className="text-sm text-muted-foreground">From Pipeline</p>
                <p className="text-2xl font-bold text-green-600">{pipelineWon}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-500/30">
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
                <p className="text-2xl font-bold text-red-600">{enquiryLost}</p>
              </div>
              <div className="p-3 rounded-lg bg-red-500/10">
                <p className="text-sm text-muted-foreground">Pipeline Lost</p>
                <p className="text-2xl font-bold text-red-600">{pipelineLost}</p>
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
    </div>
  );
}
