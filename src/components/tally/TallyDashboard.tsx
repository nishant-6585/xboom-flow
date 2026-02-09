import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  IndianRupee,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Search,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface TallyOrder {
  id: string;
  order_number: string | null;
  product_name: string;
  product_category: string;
  quantity: number;
  customer_name: string;
  customer_company: string;
  total_sales_amount: number | null;
  amount_paid: number | null;
  payment_status: string;
  status: string;
  created_at: string;
  selling_price: number | null;
  procurement_rate: number | null;
}

interface TallyProcurement {
  id: string;
  procurement_number: string | null;
  order_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number | null;
  total_amount: number | null;
  payment_status: string;
  supplier_name: string | null;
}

interface TallyRow {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerCompany: string;
  productName: string;
  quantity: number;
  salesValue: number;
  amountReceived: number;
  pendingPayment: number;
  procurementValue: number;
  profit: number;
  profitMargin: number;
  orderStatus: string;
  paymentStatus: string;
  procurementPaymentStatus: string;
}

type SortField = "orderNumber" | "salesValue" | "pendingPayment" | "procurementValue" | "profit" | "profitMargin";
type SortDir = "asc" | "desc";

const fmt = (v: number) => {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v.toLocaleString("en-IN")}`;
};

export function TallyDashboard() {
  const [orders, setOrders] = useState<TallyOrder[]>([]);
  const [procurements, setProcurements] = useState<TallyProcurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("orderNumber");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ordersRes, procRes] = await Promise.all([
          supabase
            .from("orders")
            .select("id, order_number, product_name, product_category, quantity, customer_name, customer_company, total_sales_amount, amount_paid, payment_status, status, created_at, selling_price, procurement_rate")
            .not("status", "eq", "cancelled")
            .order("created_at", { ascending: false }),
          supabase
            .from("inventory_procurements")
            .select("id, procurement_number, order_id, product_name, quantity, unit_price, total_amount, payment_status, supplier_name")
            .not("order_id", "is", null),
        ]);

        setOrders(ordersRes.data || []);
        setProcurements(procRes.data || []);
      } catch (err) {
        console.error("Error fetching tally data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const procByOrder = useMemo(() => {
    const map = new Map<string, TallyProcurement[]>();
    procurements.forEach((p) => {
      if (p.order_id) {
        const arr = map.get(p.order_id) || [];
        arr.push(p);
        map.set(p.order_id, arr);
      }
    });
    return map;
  }, [procurements]);

  const rows: TallyRow[] = useMemo(() => {
    return orders.map((o) => {
      const procs = procByOrder.get(o.id) || [];
      const salesValue = o.total_sales_amount || 0;
      const amountReceived = o.amount_paid || 0;
      const pendingPayment = salesValue - amountReceived;
      const procurementValue = procs.reduce((s, p) => s + (p.total_amount || 0), 0);
      const profit = salesValue - procurementValue;
      const profitMargin = salesValue > 0 ? (profit / salesValue) * 100 : 0;
      const procPayStatuses = procs.map((p) => p.payment_status);
      const procPaymentStatus = procPayStatuses.length === 0
        ? "no_proc"
        : procPayStatuses.every((s) => s === "paid")
        ? "paid"
        : procPayStatuses.some((s) => s === "partial")
        ? "partial"
        : "pending";

      return {
        orderId: o.id,
        orderNumber: o.order_number || "—",
        customerName: o.customer_name,
        customerCompany: o.customer_company,
        productName: o.product_name,
        quantity: o.quantity,
        salesValue,
        amountReceived,
        pendingPayment,
        procurementValue,
        profit,
        profitMargin,
        orderStatus: o.status,
        paymentStatus: o.payment_status,
        procurementPaymentStatus: procPaymentStatus,
      };
    });
  }, [orders, procByOrder]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = q
      ? rows.filter(
          (r) =>
            r.orderNumber.toLowerCase().includes(q) ||
            r.customerName.toLowerCase().includes(q) ||
            r.customerCompany.toLowerCase().includes(q) ||
            r.productName.toLowerCase().includes(q)
        )
      : rows;

    return [...list].sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [rows, search, sortField, sortDir]);

  // Aggregates
  const totals = useMemo(() => {
    const totalSales = rows.reduce((s, r) => s + r.salesValue, 0);
    const totalReceived = rows.reduce((s, r) => s + r.amountReceived, 0);
    const totalPending = rows.reduce((s, r) => s + r.pendingPayment, 0);
    const totalProcurement = rows.reduce((s, r) => s + r.procurementValue, 0);
    const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
    const avgMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
    return { totalSales, totalReceived, totalPending, totalProcurement, totalProfit, avgMargin };
  }, [rows]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortBtn = ({ field, label }: { field: SortField; label: string }) => (
    <Button variant="ghost" size="sm" className="h-auto p-0 font-medium hover:bg-transparent" onClick={() => toggleSort(field)}>
      {label}
      <ArrowUpDown className={`ml-1 h-3 w-3 ${sortField === field ? "text-primary" : "text-muted-foreground/50"}`} />
    </Button>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  const statCards = [
    { label: "Total Sales Value", value: fmt(totals.totalSales), icon: IndianRupee, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Amount Received", value: fmt(totals.totalReceived), icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Pending Payment", value: fmt(totals.totalPending), icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Procurement Cost", value: fmt(totals.totalProcurement), icon: TrendingDown, color: "text-rose-500", bg: "bg-rose-500/10" },
    { label: "Total Profit", value: fmt(totals.totalProfit), icon: TrendingUp, color: totals.totalProfit >= 0 ? "text-emerald-500" : "text-rose-500", bg: totals.totalProfit >= 0 ? "bg-emerald-500/10" : "bg-rose-500/10" },
    { label: "Avg Margin", value: `${totals.avgMargin.toFixed(1)}%`, icon: TrendingUp, color: totals.avgMargin >= 0 ? "text-primary" : "text-rose-500", bg: totals.avgMargin >= 0 ? "bg-primary/10" : "bg-rose-500/10" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((s) => (
          <Card key={s.label} className="glass">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <div className={`p-1.5 rounded-md ${s.bg}`}>
                  <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                </div>
              </div>
              <p className="text-lg sm:text-xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tally Table */}
      <Card className="glass">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-lg">Order-Procurement Tally</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search order, customer, product..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><SortBtn field="orderNumber" label="Order #" /></TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right"><SortBtn field="salesValue" label="Sales Value" /></TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right"><SortBtn field="pendingPayment" label="Pending" /></TableHead>
                  <TableHead className="text-right"><SortBtn field="procurementValue" label="Proc. Cost" /></TableHead>
                  <TableHead className="text-right"><SortBtn field="profit" label="Profit" /></TableHead>
                  <TableHead className="text-right"><SortBtn field="profitMargin" label="Margin" /></TableHead>
                  <TableHead>Pay Status</TableHead>
                  <TableHead>Proc Pay</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-10 text-muted-foreground">
                      No orders found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.orderId}>
                      <TableCell className="font-mono text-xs font-medium">{r.orderNumber}</TableCell>
                      <TableCell>
                        <div className="max-w-[140px]">
                          <p className="text-sm font-medium truncate">{r.customerName}</p>
                          <p className="text-xs text-muted-foreground truncate">{r.customerCompany}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm max-w-[120px] truncate">{r.productName}</TableCell>
                      <TableCell className="text-right font-medium text-sm">{fmt(r.salesValue)}</TableCell>
                      <TableCell className="text-right text-sm text-emerald-600 dark:text-emerald-400">{fmt(r.amountReceived)}</TableCell>
                      <TableCell className="text-right text-sm">
                        <span className={r.pendingPayment > 0 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}>
                          {fmt(r.pendingPayment)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm">{fmt(r.procurementValue)}</TableCell>
                      <TableCell className="text-right text-sm">
                        <span className={r.profit >= 0 ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-rose-600 dark:text-rose-400 font-medium"}>
                          {fmt(r.profit)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <span className={r.profitMargin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                          {r.profitMargin.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <PayBadge status={r.paymentStatus} />
                      </TableCell>
                      <TableCell>
                        <ProcPayBadge status={r.procurementPaymentStatus} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {filtered.length > 0 && (
            <div className="px-4 py-3 border-t text-xs text-muted-foreground">
              Showing {filtered.length} of {rows.length} orders
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PayBadge({ status }: { status: string }) {
  switch (status) {
    case "full": return <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[10px]">Full</Badge>;
    case "partial": return <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 text-[10px]">Partial</Badge>;
    default: return <Badge className="bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20 text-[10px]">Pending</Badge>;
  }
}

function ProcPayBadge({ status }: { status: string }) {
  switch (status) {
    case "paid": return <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[10px]">Paid</Badge>;
    case "partial": return <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 text-[10px]">Partial</Badge>;
    case "pending": return <Badge className="bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20 text-[10px]">Pending</Badge>;
    default: return <Badge variant="outline" className="text-[10px]">No Proc</Badge>;
  }
}
