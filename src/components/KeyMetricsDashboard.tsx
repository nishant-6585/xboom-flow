import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { 
  TrendingUp, 
  Package, 
  ShoppingCart, 
  IndianRupee, 
  Users, 
  Clock, 
  CheckCircle2,
  AlertTriangle,
  Truck,
  Wallet
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { useAnalyticsScope } from "@/contexts/AnalyticsScopeContext";
import { IncludeWebsiteToggle } from "@/components/analytics/IncludeWebsiteToggle";

interface KeyMetrics {
  // Sales metrics
  totalPipeline: number;
  pipelineValue: number;
  hotLeads: number; // probability >= 70%
  
  // Order metrics
  activeOrders: number;
  pendingDelivery: number;
  ordersThisMonth: number;
  
  // Procurement metrics
  pendingProcurements: number;
  procurementsInProcess: number;
  pendingSupplierPayments: number;
  
  // Finance metrics
  pendingPayments: number;
  receivedThisMonth: number;
  expectedPaymentsThisWeek: number;
}

export function KeyMetricsDashboard() {
  const { role } = useAuth();
  const { includeWebsite } = useAnalyticsScope();
  const [metrics, setMetrics] = useState<KeyMetrics>({
    totalPipeline: 0,
    pipelineValue: 0,
    hotLeads: 0,
    activeOrders: 0,
    pendingDelivery: 0,
    ordersThisMonth: 0,
    pendingProcurements: 0,
    procurementsInProcess: 0,
    pendingSupplierPayments: 0,
    pendingPayments: 0,
    receivedThisMonth: 0,
    expectedPaymentsThisWeek: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const endOfWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

        // Fetch all data in parallel
        const [
          pipelineRes,
          ordersRes,
          procurementsRes,
          supplierPaymentsRes,
          paymentRecordsRes,
          expectedPaymentsRes
        ] = await Promise.all([
          supabase.from("pipeline_orders").select("id, expected_price, probability, status"),
          supabase.from("orders").select("id, status, created_at, order_date, payment_status, total_sales_amount, amount_paid, source"),
          supabase.from("inventory_procurements").select("id, payment_status"),
          supabase.from("supplier_payments").select("id, amount, payment_date"),
          supabase.from("payment_records").select("id, amount, status, created_at"),
          supabase.from("expected_payments").select("id, amount, expected_date, status"),
        ]);

        // Calculate pipeline metrics
        const pipeline = pipelineRes.data || [];
        const activePipeline = pipeline.filter(p => !["won", "lost", "cancelled"].includes(p.status));
        const hotLeads = activePipeline.filter(p => (p.probability || 0) >= 70);
        const pipelineValue = activePipeline.reduce((sum, p) => sum + (p.expected_price || 0), 0);

        // Calculate order metrics
        const allOrders = ordersRes.data || [];
        const orders = includeWebsite
          ? allOrders
          : allOrders.filter((o: any) => (o.source ?? "manual") !== "website");
        const activeOrders = orders.filter(o => !["delivery_done", "cancelled"].includes(o.status));
        const pendingDelivery = orders.filter(o => o.status === "procurement_done");
        const ordersThisMonth = orders.filter(o => new Date(o.order_date || o.created_at) >= new Date(startOfMonth));

        // Calculate procurement metrics
        const procurements = procurementsRes.data || [];
        const pendingProcurements = procurements.filter(p => p.payment_status === "pending");
        const procurementsInProcess = procurements.filter(p => p.payment_status === "partial");

        // Calculate pending supplier payments
        const pendingSupplierPayments = pendingProcurements.length + procurementsInProcess.length;

        // Calculate finance metrics
        const paymentRecords = paymentRecordsRes.data || [];
        const approvedPayments = paymentRecords.filter(p => p.status === "approved");
        const receivedThisMonth = approvedPayments
          .filter(p => new Date(p.created_at) >= new Date(startOfMonth))
          .reduce((sum, p) => sum + (p.amount || 0), 0);

        const pendingPaymentOrders = orders.filter(o => 
          o.payment_status === "pending" || o.payment_status === "partial"
        );

        // Expected payments this week
        const expectedPayments = expectedPaymentsRes.data || [];
        const expectedThisWeek = expectedPayments.filter(p => 
          p.status === "pending" && 
          new Date(p.expected_date) >= new Date(startOfWeek) &&
          new Date(p.expected_date) <= new Date(endOfWeek)
        );

        setMetrics({
          totalPipeline: activePipeline.length,
          pipelineValue,
          hotLeads: hotLeads.length,
          activeOrders: activeOrders.length,
          pendingDelivery: pendingDelivery.length,
          ordersThisMonth: ordersThisMonth.length,
          pendingProcurements: pendingProcurements.length,
          procurementsInProcess: procurementsInProcess.length,
          pendingSupplierPayments,
          pendingPayments: pendingPaymentOrders.length,
          receivedThisMonth,
          expectedPaymentsThisWeek: expectedThisWeek.reduce((sum, p) => sum + (p.amount || 0), 0),
        });
      } catch (error) {
        console.error("Error fetching metrics:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [includeWebsite]);

  const formatCurrency = (value: number) => {
    if (value >= 10000000) {
      return `₹${(value / 10000000).toFixed(1)}Cr`;
    } else if (value >= 100000) {
      return `₹${(value / 100000).toFixed(1)}L`;
    } else if (value >= 1000) {
      return `₹${(value / 1000).toFixed(1)}K`;
    }
    return `₹${value.toFixed(0)}`;
  };

  const canViewSalesMetrics = role === "sales" || role === "admin" || role === "supply_chain";
  const canViewProcurementMetrics = role === "admin" || role === "supply_chain" || role === "finance";
  const canViewFinanceMetrics = role === "admin" || role === "finance";

  const salesMetrics = [
    {
      label: "Active Pipeline",
      value: metrics.totalPipeline,
      icon: TrendingUp,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      link: "/sales",
    },
    {
      label: "Pipeline Value",
      value: formatCurrency(metrics.pipelineValue),
      icon: IndianRupee,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      link: "/sales",
      isFormatted: true,
    },
    {
      label: "Hot Leads (≥70%)",
      value: metrics.hotLeads,
      icon: Users,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
      link: "/sales",
    },
  ];

  const orderMetrics = [
    {
      label: "Active Orders",
      value: metrics.activeOrders,
      icon: Package,
      color: "text-primary",
      bg: "bg-primary/10",
      link: "/orders",
    },
    {
      label: "Pending Delivery",
      value: metrics.pendingDelivery,
      icon: Truck,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      link: "/orders",
    },
    {
      label: "Orders This Month",
      value: metrics.ordersThisMonth,
      icon: CheckCircle2,
      color: "text-success",
      bg: "bg-success/10",
      link: "/orders",
    },
  ];

  const procurementMetrics = [
    {
      label: "Pending Procurements",
      value: metrics.pendingProcurements,
      icon: ShoppingCart,
      color: "text-violet-500",
      bg: "bg-violet-500/10",
      link: "/procurement",
    },
    {
      label: "In Process",
      value: metrics.procurementsInProcess,
      icon: Clock,
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
      link: "/procurement",
    },
    {
      label: "Supplier Payments Due",
      value: metrics.pendingSupplierPayments,
      icon: AlertTriangle,
      color: "text-warning",
      bg: "bg-warning/10",
      link: "/procurement",
    },
  ];

  const financeMetrics = [
    {
      label: "Pending Payments",
      value: metrics.pendingPayments,
      icon: Clock,
      color: "text-rose-500",
      bg: "bg-rose-500/10",
      link: "/finance",
    },
    {
      label: "Received This Month",
      value: formatCurrency(metrics.receivedThisMonth),
      icon: Wallet,
      color: "text-success",
      bg: "bg-success/10",
      link: "/finance",
      isFormatted: true,
    },
    {
      label: "Expected This Week",
      value: formatCurrency(metrics.expectedPaymentsThisWeek),
      icon: IndianRupee,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      link: "/finance",
      isFormatted: true,
    },
  ];

  const MetricCard = ({ metric }: { metric: typeof salesMetrics[0] }) => (
    <Link to={metric.link}>
      <Card className="glass cursor-pointer transition-all hover:shadow-md hover:border-primary/50 hover:scale-[1.02]">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">{metric.label}</p>
              <p className="text-xl sm:text-2xl font-bold mt-1">
                {loading ? "..." : metric.isFormatted ? metric.value : metric.value}
              </p>
            </div>
            <div className={`p-2 sm:p-3 rounded-lg ${metric.bg}`}>
              <metric.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${metric.color}`} />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-end">
        <IncludeWebsiteToggle />
      </div>
      {/* Sales & Pipeline Metrics */}
      {canViewSalesMetrics && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold">Sales & Pipeline</h3>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {salesMetrics.map((metric) => (
              <MetricCard key={metric.label} metric={metric} />
            ))}
          </div>
        </div>
      )}

      {/* Order Metrics */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Orders</h3>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {orderMetrics.map((metric) => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
        </div>
      </div>

      {/* Procurement Metrics */}
      {canViewProcurementMetrics && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-violet-500" />
            <h3 className="text-lg font-semibold">Procurement</h3>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {procurementMetrics.map((metric) => (
              <MetricCard key={metric.label} metric={metric} />
            ))}
          </div>
        </div>
      )}

      {/* Finance Metrics */}
      {canViewFinanceMetrics && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <IndianRupee className="w-5 h-5 text-success" />
            <h3 className="text-lg font-semibold">Finance</h3>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {financeMetrics.map((metric) => (
              <MetricCard key={metric.label} metric={metric} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
