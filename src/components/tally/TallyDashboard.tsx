import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  IndianRupee, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Search, ArrowUpDown, Calendar, User, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, format, isWithinInterval, startOfDay,
} from "date-fns";

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
  order_date: string | null;
  selling_price: number | null;
  procurement_rate: number | null;
  sales_person_name: string;
  sales_person_id: string;
  po_number: string | null;
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
  po_number: string | null;
}

interface TallyInvoice {
  id: string;
  invoice_number: string;
  order_id: string | null;
  customer_gst: string | null;
}

interface TallyRow {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerCompany: string;
  productName: string;
  productCategory: string;
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
  salesPersonName: string;
  createdAt: string;
  invoiceNumber: string;
  poNumber: string;
  supplierName: string;
  customerGst: string;
}

type SortField = "orderNumber" | "salesValue" | "pendingPayment" | "procurementValue" | "profit" | "profitMargin";
type SortDir = "asc" | "desc";
type TimePeriod = "this_week" | "this_month" | "prev_month";

const fmt = (v: number) => {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v.toLocaleString("en-IN")}`;
};

function getDateRange(period: TimePeriod): { start: Date; end: Date } {
  const now = new Date();
  switch (period) {
    case "this_week":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case "this_month":
      return { start: startOfMonth(now), end: now };
    case "prev_month":
      const prev = subMonths(now, 1);
      return { start: startOfMonth(prev), end: endOfMonth(prev) };
  }
}

export function TallyDashboard() {
  const [allOrders, setAllOrders] = useState<TallyOrder[]>([]);
  const [procurements, setProcurements] = useState<TallyProcurement[]>([]);
  const [invoices, setInvoices] = useState<TallyInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("orderNumber");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("this_month");
  const [salesPersonFilter, setSalesPersonFilter] = useState<string>("all");
  const [payStatusFilter, setPayStatusFilter] = useState<string>("all");
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ordersRes, procRes, invRes] = await Promise.all([
          supabase
            .from("orders")
            .select("id, order_number, product_name, product_category, quantity, customer_name, customer_company, total_sales_amount, amount_paid, payment_status, status, created_at, order_date, selling_price, procurement_rate, sales_person_name, sales_person_id, po_number")
            .not("status", "eq", "cancelled")
            .order("created_at", { ascending: false }),
          supabase
            .from("inventory_procurements")
            .select("id, procurement_number, order_id, product_name, quantity, unit_price, total_amount, payment_status, supplier_name, po_number")
            .not("order_id", "is", null),
          supabase
            .from("invoices")
            .select("id, invoice_number, order_id, customer_gst")
            .not("order_id", "is", null),
        ]);
        setAllOrders(ordersRes.data || []);
        setProcurements(procRes.data || []);
        setInvoices(invRes.data || []);
      } catch (err) {
        console.error("Error fetching tally data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const salesPersons = useMemo(() => {
    const names = new Set<string>();
    allOrders.forEach((o) => { if (o.sales_person_name) names.add(o.sales_person_name); });
    return Array.from(names).sort();
  }, [allOrders]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    allOrders.forEach((o) => { if (o.product_category) cats.add(o.product_category); });
    return Array.from(cats).sort();
  }, [allOrders]);

  const orders = useMemo(() => {
    const { start, end } = getDateRange(timePeriod);
    return allOrders.filter((o) => {
      const d = new Date(o.order_date || o.created_at);
      const inRange = isWithinInterval(d, { start: startOfDay(start), end });
      const matchesPerson = salesPersonFilter === "all" || o.sales_person_name === salesPersonFilter;
      return inRange && matchesPerson;
    });
  }, [allOrders, timePeriod, salesPersonFilter]);

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

  const invByOrder = useMemo(() => {
    const map = new Map<string, TallyInvoice[]>();
    invoices.forEach((inv) => {
      if (inv.order_id) {
        const arr = map.get(inv.order_id) || [];
        arr.push(inv);
        map.set(inv.order_id, arr);
      }
    });
    return map;
  }, [invoices]);

  const rows: TallyRow[] = useMemo(() => {
    return orders.map((o) => {
      const procs = procByOrder.get(o.id) || [];
      const invs = invByOrder.get(o.id) || [];
      const salesValue = o.total_sales_amount || 0;
      const amountReceived = o.amount_paid || 0;
      const pendingPayment = salesValue - amountReceived;
      const procurementValue = procs.reduce((s, p) => s + (p.total_amount || 0), 0);
      const profit = salesValue - procurementValue;
      const profitMargin = salesValue > 0 ? (profit / salesValue) * 100 : 0;
      const procPayStatuses = procs.map((p) => p.payment_status);
      const procPaymentStatus = procPayStatuses.length === 0
        ? "no_proc"
        : procPayStatuses.every((s) => s === "paid") ? "paid"
        : procPayStatuses.some((s) => s === "partial") ? "partial" : "pending";

      const invoiceNumber = invs.map(i => i.invoice_number).filter(Boolean).join(", ") || "—";
      const poNumber = o.po_number || procs.map(p => p.po_number).filter(Boolean).join(", ") || "—";
      const supplierName = procs.map(p => p.supplier_name).filter(Boolean).join(", ") || "—";
      const customerGst = invs.map(i => i.customer_gst).filter(Boolean).join(", ") || "—";

      return {
        orderId: o.id,
        orderNumber: o.order_number || "—",
        customerName: o.customer_name,
        customerCompany: o.customer_company,
        productName: o.product_name,
        productCategory: o.product_category,
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
        salesPersonName: o.sales_person_name,
        createdAt: o.created_at,
        invoiceNumber,
        poNumber,
        supplierName,
        customerGst,
      };
    });
  }, [orders, procByOrder, invByOrder]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = rows;

    if (q) {
      list = list.filter((r) =>
        r.orderNumber.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.customerCompany.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        r.invoiceNumber.toLowerCase().includes(q) ||
        r.poNumber.toLowerCase().includes(q) ||
        r.supplierName.toLowerCase().includes(q) ||
        r.customerGst.toLowerCase().includes(q)
      );
    }

    if (payStatusFilter !== "all") {
      list = list.filter(r => r.paymentStatus === payStatusFilter);
    }
    if (orderStatusFilter !== "all") {
      list = list.filter(r => r.orderStatus === orderStatusFilter);
    }
    if (categoryFilter !== "all") {
      list = list.filter(r => r.productCategory === categoryFilter);
    }

    return [...list].sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [rows, search, sortField, sortDir, payStatusFilter, orderStatusFilter, categoryFilter]);

  const totals = useMemo(() => {
    const totalSales = rows.reduce((s, r) => s + r.salesValue, 0);
    const totalReceived = rows.reduce((s, r) => s + r.amountReceived, 0);
    const totalPending = rows.reduce((s, r) => s + r.pendingPayment, 0);
    const totalProcurement = rows.reduce((s, r) => s + r.procurementValue, 0);
    const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
    const avgMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
    return { totalSales, totalReceived, totalPending, totalProcurement, totalProfit, avgMargin };
  }, [rows]);

  const comparisonData = useMemo(() => {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const dayOfMonth = now.getDate();
    const prevMonthStart = startOfMonth(subMonths(now, 1));
    const days = Array.from({ length: dayOfMonth }, (_, i) => i + 1);

    return days.map((day) => {
      const currentDayOrders = allOrders.filter((o) => {
        const d = new Date(o.order_date || o.created_at);
        return d.getDate() === day &&
          d.getMonth() === currentMonthStart.getMonth() &&
          d.getFullYear() === currentMonthStart.getFullYear() &&
          (salesPersonFilter === "all" || o.sales_person_name === salesPersonFilter);
      });

      const prevDayOrders = allOrders.filter((o) => {
        const d = new Date(o.order_date || o.created_at);
        return d.getDate() === day &&
          d.getMonth() === prevMonthStart.getMonth() &&
          d.getFullYear() === prevMonthStart.getFullYear() &&
          (salesPersonFilter === "all" || o.sales_person_name === salesPersonFilter);
      });

      return {
        day: `Day ${day}`,
        currentMonth: currentDayOrders.reduce((s, o) => s + (o.total_sales_amount || 0), 0),
        prevMonth: prevDayOrders.reduce((s, o) => s + (o.total_sales_amount || 0), 0),
        currentOrders: currentDayOrders.length,
        prevOrders: prevDayOrders.length,
      };
    });
  }, [allOrders, salesPersonFilter]);

  const currentMonthLabel = format(new Date(), "MMM yyyy");
  const prevMonthLabel = format(subMonths(new Date(), 1), "MMM yyyy");

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

  const periodLabel = timePeriod === "this_week" ? "This Week" : timePeriod === "this_month" ? "Month Till Date" : "Previous Month";
  const activeFilterCount = [payStatusFilter, orderStatusFilter, categoryFilter].filter(f => f !== "all").length;

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

  const formatChartValue = (value: number) => {
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
    return `₹${value}`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Filters Row */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Select value={timePeriod} onValueChange={(v) => setTimePeriod(v as TimePeriod)}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_week">This Week</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="prev_month">Previous Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <Select value={salesPersonFilter} onValueChange={setSalesPersonFilter}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="All Salespersons" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Salespersons</SelectItem>
                {salesPersons.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px]">{activeFilterCount}</Badge>
            )}
          </Button>
          <Badge variant="outline" className="text-xs">
            {periodLabel} · {filtered.length} of {rows.length} orders
          </Badge>
        </div>

        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-muted/30">
            <Select value={payStatusFilter} onValueChange={setPayStatusFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="Payment Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Pay Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="full">Full</SelectItem>
              </SelectContent>
            </Select>
            <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="Order Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Order Status</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="dispatched">Dispatched</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Product Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setPayStatusFilter("all"); setOrderStatusFilter("all"); setCategoryFilter("all"); }}>
                Clear Filters
              </Button>
            )}
          </div>
        )}
      </div>

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

      {/* Comparison Chart */}
      <Card className="glass">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Sales Comparison: {currentMonthLabel} vs {prevMonthLabel}
          </CardTitle>
          <p className="text-xs text-muted-foreground">Day-wise sales value comparison (till date)</p>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] sm:h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} className="fill-muted-foreground" interval={Math.max(0, Math.floor(comparisonData.length / 10) - 1)} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" tickFormatter={formatChartValue} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-sm">
                        <p className="font-medium mb-2">{label}</p>
                        {payload.map((entry: any, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: entry.color }} />
                            <span className="text-muted-foreground">{entry.name}:</span>
                            <span className="font-medium">{fmt(entry.value)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} iconType="square" iconSize={10} />
                <Bar dataKey="currentMonth" name={currentMonthLabel} fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} maxBarSize={20} />
                <Bar dataKey="prevMonth" name={prevMonthLabel} fill="hsl(var(--muted-foreground))" opacity={0.5} radius={[3, 3, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Tally Table */}
      <Card className="glass">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-lg">Order-Procurement Tally</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search order, customer, invoice, PO, supplier, GST..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><SortBtn field="orderNumber" label="Order #" /></TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>PO #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>GST No.</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Sales Person</TableHead>
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
                    <TableCell colSpan={16} className="text-center py-10 text-muted-foreground">
                      No orders found for {periodLabel}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.orderId}>
                      <TableCell className="font-mono text-xs font-medium">{r.orderNumber}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.invoiceNumber}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.poNumber}</TableCell>
                      <TableCell>
                        <div className="max-w-[140px]">
                          <p className="text-sm font-medium truncate">{r.customerName}</p>
                          <p className="text-xs text-muted-foreground truncate">{r.customerCompany}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono max-w-[120px] truncate">{r.customerGst}</TableCell>
                      <TableCell className="text-sm max-w-[120px] truncate">{r.productName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[100px] truncate">{r.supplierName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[100px] truncate">{r.salesPersonName}</TableCell>
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
                      <TableCell><PayBadge status={r.paymentStatus} /></TableCell>
                      <TableCell><ProcPayBadge status={r.procurementPaymentStatus} /></TableCell>
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
