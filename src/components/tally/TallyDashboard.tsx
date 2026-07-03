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
  IndianRupee, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Search, ArrowUpDown, Calendar, User, ExternalLink, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComp } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, format, eachDayOfInterval, isWithinInterval, startOfDay, endOfDay, startOfYear, startOfQuarter, endOfQuarter, subDays,
} from "date-fns";
import { OrderDialog } from "@/components/OrderDialog";
import { ProcurementOrderDialog } from "@/components/procurement/ProcurementOrderDialog";
import { Order } from "@/hooks/useOrders";
import { useSuppliers } from "@/hooks/useSuppliers";
import { toast } from "sonner";
import { PaymentModeBadge } from "@/components/PaymentModeBadge";
import { getPaymentModeLabel } from "@/lib/paymentModes";
import { useTableExport } from "@/hooks/useTableExport";
import { Download } from "lucide-react";

interface TallyOrder {
  id: string;
  order_number: string | null;
  product_name: string;
  product_category: string;
  quantity: number;
  customer_name: string;
  customer_company: string;
  customer_gst: string | null;
  total_sales_amount: number | null;
  amount_paid: number | null;
  payment_status: string;
  status: string;
  created_at: string;
  order_date: string | null;
  selling_price: number | null;
  procurement_rate: number | null;
  estimated_procurement_rate: number | null;
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

interface TallyOrderItem {
  id: string;
  order_id: string;
  product_name: string;
  quantity: number;
  procurement_rate: number | null;
  estimated_procurement_rate: number | null;
  quantity_procured: number | null;
  procurement_gst_amount: number | null;
  procurement_price_includes_gst: boolean | null;
  unit_price: number | null;
  sales_gst_amount: number | null;
  sales_price_includes_gst: boolean | null;
  supplier_id: string | null;
}

interface TallyInvoice {
  id: string;
  invoice_number: string | null;
  order_id: string | null;
  document_type: string | null;
}

interface ZohoInvoiceLink {
  invoice_number: string | null;
  linked_order_id: string | null;
}

interface TallyInventoryLink {
  id: string;
  order_id: string;
  inventory_procurement_id: string;
  quantity_used: number;
  procurement?: {
    po_number: string | null;
    procurement_number: string | null;
    unit_price: number | null;
    total_amount: number | null;
    supplier_name: string | null;
    product_name: string;
  };
}

interface TallyPrimaryMode {
  order_id: string;
  primary_payment_mode: string | null;
}

interface TallySupplier {
  id: string;
  name: string | null;
  brand_name: string | null;
  contact_name: string | null;
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
  procurementCostKnown: boolean;
  estimatedProcurementValue: number;
  estimatedCostKnown: boolean;
  estimatedProfit: number;
  estimatedProfitMargin: number;
  profit: number;
  profitMargin: number;
  orderStatus: string;
  paymentStatus: string;
  procurementPaymentStatus: string;
  salesPersonName: string;
  createdAt: string;
  orderDate: string | null;
  invoiceNumber: string;
  proformaNumber: string;
  poNumber: string;
  supplierName: string;
  customerGst: string;
  inventoryFulfilled: boolean;
  inventorySourcePO: string;
  inventoryCost: number;
  primaryPaymentMode: string | null;
}

type SortField = "orderNumber" | "orderDate" | "salesValue" | "pendingPayment" | "procurementValue" | "profit" | "profitMargin";
type SortDir = "asc" | "desc";
type TimePeriod = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "prev_month" | "last_3_months" | "this_quarter" | "last_quarter" | "ytd" | "all" | "custom";

const fmt = (v: number) => {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v.toLocaleString("en-IN")}`;
};

function getDateRange(period: TimePeriod): { start: Date; end: Date } {
  const now = new Date();
  switch (period) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case "this_week":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case "last_week": {
      const lw = subDays(now, 7);
      return { start: startOfWeek(lw, { weekStartsOn: 1 }), end: endOfWeek(lw, { weekStartsOn: 1 }) };
    }
    case "this_month":
      return { start: startOfMonth(now), end: now };
    case "prev_month": {
      const prev = subMonths(now, 1);
      return { start: startOfMonth(prev), end: endOfMonth(prev) };
    }
    case "last_3_months":
      return { start: startOfMonth(subMonths(now, 2)), end: endOfDay(now) };
    case "this_quarter":
      return { start: startOfQuarter(now), end: endOfDay(now) };
    case "last_quarter": {
      const lq = subMonths(now, 3);
      return { start: startOfQuarter(lq), end: endOfQuarter(lq) };
    }
    case "ytd":
      return { start: startOfYear(now), end: endOfDay(now) };
    case "all":
      return { start: new Date(2000, 0, 1), end: endOfDay(now) };
    case "custom":
      return { start: startOfDay(now), end: endOfDay(now) };
  }
}

export function TallyDashboard() {
  const [allOrders, setAllOrders] = useState<TallyOrder[]>([]);
  const [procurements, setProcurements] = useState<TallyProcurement[]>([]);
  const [orderItems, setOrderItems] = useState<TallyOrderItem[]>([]);
  const [invoices, setInvoices] = useState<TallyInvoice[]>([]);
  const [zohoInvoices, setZohoInvoices] = useState<ZohoInvoiceLink[]>([]);
  const [suppliers, setSuppliers] = useState<TallySupplier[]>([]);
  const [invLinks, setInvLinks] = useState<TallyInventoryLink[]>([]);
  const [primaryModes, setPrimaryModes] = useState<TallyPrimaryMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("orderNumber");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("this_month");
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();
  const [salesPersonFilter, setSalesPersonFilter] = useState<string>("all");

  // Drill-down dialog state
  const [selectedFullOrder, setSelectedFullOrder] = useState<Order | null>(null);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [procDialogOpen, setProcDialogOpen] = useState(false);
  const [dialogLoading, setDialogLoading] = useState(false);

  const { suppliers: suppliersList } = useSuppliers();
  const { exportToExcel } = useTableExport();

  const fetchFullOrder = useCallback(async (orderId: string): Promise<Order | null> => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();
      if (error) throw error;
      return data as unknown as Order;
    } catch (err) {
      console.error("Error fetching order:", err);
      toast.error("Failed to load order details");
      return null;
    }
  }, []);

  const openOrderDialog = useCallback(async (orderId: string) => {
    setDialogLoading(true);
    const order = await fetchFullOrder(orderId);
    setDialogLoading(false);
    if (order) {
      setSelectedFullOrder(order);
      setOrderDialogOpen(true);
    }
  }, [fetchFullOrder]);

  const openProcDialog = useCallback(async (orderId: string) => {
    setDialogLoading(true);
    const order = await fetchFullOrder(orderId);
    setDialogLoading(false);
    if (order) {
      setSelectedFullOrder(order);
      setProcDialogOpen(true);
    }
  }, [fetchFullOrder]);

  const handleOrderUpdate = useCallback(async (orderId: string, updates: Partial<Order>) => {
    try {
      const { error } = await supabase.from("orders").update(updates).eq("id", orderId);
      if (error) throw error;
      toast.success("Order updated");
      return true;
    } catch { toast.error("Update failed"); return false; }
  }, []);

  const handleOrderDelete = useCallback(async () => {
    return false; // Read-only in tally context
  }, []);

  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [ordersRes, procRes, itemsRes, invoicesRes, suppliersRes, linksRes] = await Promise.all([
          supabase
            .from("orders")
            .select("id, order_number, product_name, product_category, quantity, customer_name, customer_company, customer_gst, total_sales_amount, amount_paid, payment_status, status, created_at, order_date, selling_price, procurement_rate, estimated_procurement_rate, sales_person_name, sales_person_id, po_number")
            .not("status", "eq", "cancelled")
            // Exclude website (WooCommerce) orders that are still awaiting
            // payment — these typically get auto-cancelled by Woo and should
            // not pollute Tally. They reappear automatically once Woo marks
            // them as processing/completed (payment_status flips to "full").
            .or("source.neq.website,payment_status.neq.pending")
            .order("created_at", { ascending: false }),
          supabase
            .from("inventory_procurements")
            .select("id, procurement_number, order_id, product_name, quantity, unit_price, total_amount, payment_status, supplier_name, po_number")
            .not("order_id", "is", null),
          supabase
            .from("order_items")
            .select("id, order_id, product_name, quantity, procurement_rate, estimated_procurement_rate, quantity_procured, procurement_gst_amount, procurement_price_includes_gst, unit_price, sales_gst_amount, sales_price_includes_gst, supplier_id"),
          supabase
            .from("order_invoices")
            .select("id, invoice_number, order_id, document_type")
            .not("order_id", "is", null),
          supabase
            .from("suppliers")
            .select("id, name, brand_name, contact_name"),
          supabase
            .from("order_procurement_links")
            .select("id, order_id, inventory_procurement_id, quantity_used"),
        ]);
        const modesRes = await supabase
          .from("order_primary_payment_mode" as any)
          .select("order_id, primary_payment_mode");
        setAllOrders(ordersRes.data || []);
        setProcurements((procRes.data as TallyProcurement[]) || []);
        setOrderItems(itemsRes.data || []);
        setInvoices(invoicesRes.data || []);
        setSuppliers(suppliersRes.data || []);
        // Zoho Books invoices already linked to internal orders via match RPC.
        // Page through results — the Data API caps a single response at 1000 rows,
        // and we can have several thousand linked invoices.
        const zohoAll: ZohoInvoiceLink[] = [];
        const pageSize = 1000;
        for (let from = 0; ; from += pageSize) {
          const { data: zohoPage, error: zohoErr } = await supabase
            .from("zoho_books_invoices")
            .select("invoice_number, linked_order_id")
            .not("linked_order_id", "is", null)
            .order("invoice_id", { ascending: true })
            .range(from, from + pageSize - 1);
          if (zohoErr) break;
          const batch = (zohoPage as ZohoInvoiceLink[]) || [];
          zohoAll.push(...batch);
          if (batch.length < pageSize) break;
        }
        setZohoInvoices(zohoAll);
        setPrimaryModes(((modesRes.data as unknown) as TallyPrimaryMode[]) || []);

        // Enrich inventory links with procurement details
        const rawLinks = (linksRes.data || []) as TallyInventoryLink[];
        if (rawLinks.length > 0) {
          const procIds = [...new Set(rawLinks.map(l => l.inventory_procurement_id))];
          const { data: linkedProcs } = await supabase
            .from("inventory_procurements")
            .select("id, po_number, procurement_number, unit_price, total_amount, supplier_name, product_name")
            .in("id", procIds);
          const procMap = new Map((linkedProcs || []).map((p: any) => [p.id, p]));
          rawLinks.forEach(l => { l.procurement = procMap.get(l.inventory_procurement_id); });
        }
        setInvLinks(rawLinks);
    } catch (err) {
      console.error("Error fetching tally data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    const t = toast.loading("Refreshing tally… syncing Zoho invoices");
    try {
      const { error: syncErr } = await supabase.functions.invoke("zoho-books-sync", { body: {} });
      if (syncErr) {
        toast.error(`Zoho sync failed: ${syncErr.message}`, { id: t });
      } else {
        toast.success("Zoho invoices synced", { id: t });
      }
      await fetchData();
    } catch (err: any) {
      toast.error(err?.message || "Refresh failed", { id: t });
    } finally {
      setRefreshing(false);
    }
  }, [fetchData, refreshing]);

  // Unique salesperson list
  const salesPersons = useMemo(() => {
    const names = new Set<string>();
    allOrders.forEach((o) => { if (o.sales_person_name) names.add(o.sales_person_name); });
    return Array.from(names).sort();
  }, [allOrders]);

  // Filter orders by date range and salesperson
  const orders = useMemo(() => {
    let start: Date; let end: Date;
    if (timePeriod === "custom") {
      if (!customStart || !customEnd) return [];
      start = startOfDay(customStart);
      end = endOfDay(customEnd);
    } else {
      const r = getDateRange(timePeriod);
      start = r.start; end = r.end;
    }
    return allOrders.filter((o) => {
      const d = new Date(o.order_date || o.created_at);
      const inRange = isWithinInterval(d, { start: startOfDay(start), end });
      const matchesPerson = salesPersonFilter === "all" || o.sales_person_name === salesPersonFilter;
      return inRange && matchesPerson;
    });
  }, [allOrders, timePeriod, customStart, customEnd, salesPersonFilter]);

  // Build lookup maps
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

  const itemsByOrder = useMemo(() => {
    const map = new Map<string, TallyOrderItem[]>();
    orderItems.forEach((item) => {
      const arr = map.get(item.order_id) || [];
      arr.push(item);
      map.set(item.order_id, arr);
    });
    return map;
  }, [orderItems]);

  const invoicesByOrder = useMemo(() => {
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

  const zohoInvoicesByOrder = useMemo(() => {
    const map = new Map<string, string[]>();
    zohoInvoices.forEach((z) => {
      if (z.linked_order_id && z.invoice_number) {
        const arr = map.get(z.linked_order_id) || [];
        arr.push(z.invoice_number);
        map.set(z.linked_order_id, arr);
      }
    });
    return map;
  }, [zohoInvoices]);

  const invLinksByOrder = useMemo(() => {
    const map = new Map<string, TallyInventoryLink[]>();
    invLinks.forEach((l) => {
      const arr = map.get(l.order_id) || [];
      arr.push(l);
      map.set(l.order_id, arr);
    });
    return map;
  }, [invLinks]);

  const primaryModeByOrder = useMemo(() => {
    const map = new Map<string, string | null>();
    primaryModes.forEach((m) => { map.set(m.order_id, m.primary_payment_mode); });
    return map;
  }, [primaryModes]);

  const suppliersMap = useMemo(() => {
    const map = new Map<string, TallySupplier>();
    suppliers.forEach((s) => map.set(s.id, s));
    return map;
  }, [suppliers]);

  const rows: TallyRow[] = useMemo(() => {
    return orders.map((o) => {
      const procs = procByOrder.get(o.id) || [];
      const items = itemsByOrder.get(o.id) || [];
      const invs = invoicesByOrder.get(o.id) || [];
      const orderInvLinks = invLinksByOrder.get(o.id) || [];

      // Gross sales (incl GST if applicable) — used for received/pending payment columns.
      const grossSalesValue = o.total_sales_amount || 0;
      const amountReceived = o.amount_paid || 0;
      const pendingPayment = grossSalesValue - amountReceived;

      // Net sales value (EXCL GST) for profit calculations.
      // Derive from order_items when available, falling back to gross when items
      // have no pricing info.
      const itemsHaveSalesPricing = items.some(i => (i.unit_price ?? 0) > 0);
      const itemsNetSales = items.reduce((sum, item) => {
        const price = item.unit_price || 0;
        const gst = item.sales_gst_amount || 0;
        const includesGst = !!item.sales_price_includes_gst;
        const basePrice = includesGst ? Math.max(price - gst, 0) : price;
        const qty = item.quantity || 0;
        return sum + (basePrice * qty);
      }, 0);
      const salesValue = itemsHaveSalesPricing ? itemsNetSales : grossSalesValue;

      // Calculate procurement cost with robust fallbacks across procurement sources
      // Calculate procurement cost. Track whether ANY source had real pricing,
      // so rows with procurements awaiting supplier pricing don't display ₹0
      // and inflate the profit / margin columns.
      // Procurement cost EXCL GST. If the entered rate already includes GST,
      // strip the GST component out so profit math is GST-neutral.
      const itemsHavePricing = items.some(i => (i.procurement_rate ?? 0) > 0);
      const itemsProcCost = items.reduce((sum, item) => {
        const rate = item.procurement_rate || 0;
        const gst = item.procurement_gst_amount || 0;
        const includesGst = !!item.procurement_price_includes_gst;
        const baseRate = includesGst ? Math.max(rate - gst, 0) : rate;
        const qty = item.quantity_procured && item.quantity_procured > 0
          ? item.quantity_procured
          : (item.quantity || 0);
        return sum + (baseRate * qty);
      }, 0);

      const orderHasPricing = (o.procurement_rate ?? 0) > 0;
      const orderLevelProcCost = (o.procurement_rate || 0) * (o.quantity || 0);

      // Inventory procurements: use unit_price * qty (excl GST) — total_amount may
      // include GST, so prefer per-unit math when rate is available.
      const procsHavePricing = procs.some(p => (p.unit_price ?? 0) > 0 || (p.total_amount ?? 0) > 0);
      const procTableCost = procs.reduce((sum, p) => {
        if ((p.unit_price ?? 0) > 0) {
          return sum + ((p.unit_price || 0) * (p.quantity || 0));
        }
        return sum + (p.total_amount || 0);
      }, 0);

      let procurementValue = 0;
      let procurementCostKnown = false;
      if (itemsHavePricing) {
        procurementValue = itemsProcCost;
        procurementCostKnown = true;
      } else if (orderHasPricing) {
        procurementValue = orderLevelProcCost;
        procurementCostKnown = true;
      } else if (procsHavePricing) {
        procurementValue = procTableCost;
        procurementCostKnown = true;
      }

      const profit = procurementCostKnown ? salesValue - procurementValue : 0;
      const profitMargin = procurementCostKnown && salesValue > 0 ? (profit / salesValue) * 100 : 0;

      // Estimated procurement cost (supply chain estimate, used when actual rate not yet set)
      const itemsHaveEstimate = items.some(i => (i.estimated_procurement_rate ?? 0) > 0);
      const itemsEstCost = items.reduce((sum, item) => {
        const rate = item.estimated_procurement_rate || 0;
        const qty = item.quantity_procured && item.quantity_procured > 0
          ? item.quantity_procured
          : (item.quantity || 0);
        return sum + (rate * qty);
      }, 0);
      const orderHasEstimate = (o.estimated_procurement_rate ?? 0) > 0;
      const orderLevelEstCost = (o.estimated_procurement_rate || 0) * (o.quantity || 0);

      // Prefer actual cost if known; otherwise use estimate.
      let estimatedProcurementValue = 0;
      let estimatedCostKnown = false;
      if (procurementCostKnown) {
        estimatedProcurementValue = procurementValue;
        estimatedCostKnown = true;
      } else if (itemsHaveEstimate) {
        estimatedProcurementValue = itemsEstCost;
        estimatedCostKnown = true;
      } else if (orderHasEstimate) {
        estimatedProcurementValue = orderLevelEstCost;
        estimatedCostKnown = true;
      }
      const estimatedProfit = estimatedCostKnown ? salesValue - estimatedProcurementValue : 0;
      const estimatedProfitMargin = estimatedCostKnown && salesValue > 0 ? (estimatedProfit / salesValue) * 100 : 0;

      const procPayStatuses = procs.map((p) => p.payment_status);
      const procPaymentStatus = procPayStatuses.length === 0
        ? "no_proc"
        : procPayStatuses.every((s) => s === "paid") ? "paid"
        : procPayStatuses.some((s) => s === "partial") ? "partial" : "pending";

      // Invoice number(s) — split tax invoices vs proforma invoices
      const taxInvs = invs.filter(i => i.document_type !== "proforma");
      const proformaInvs = invs.filter(i => i.document_type === "proforma");
      const localTaxNumbers = taxInvs.map(i => i.invoice_number).filter(Boolean) as string[];
      const zohoNumbers = zohoInvoicesByOrder.get(o.id) || [];
      const invoiceNumber = [...new Set([...localTaxNumbers, ...zohoNumbers])].join(", ") || "—";
      const proformaNumber = [...new Set(proformaInvs.map(i => i.invoice_number).filter(Boolean))].join(", ") || "—";

      // PO number: prefer PO uploaded on the order itself, fall back to linked procurement POs
      const orderPoNumbers = (o.po_number || "").split(",").map(s => s.trim()).filter(Boolean);
      const procPoNumbers = procs.map(p => p.po_number).filter(Boolean) as string[];
      const poNumber = [...new Set([...orderPoNumbers, ...procPoNumbers])].join(", ") || "—";

      // Supplier name(s): from order_items supplier_id → suppliers table, or from procurements
      const itemSupplierNames = items
        .map(item => {
          if (!item.supplier_id) return null;
          const s = suppliersMap.get(item.supplier_id);
          return s?.name || s?.brand_name || null;
        })
        .filter(Boolean);
      const procSupplierNames = procs.map(p => p.supplier_name).filter(Boolean);
      const allSuppliers = [...new Set([...itemSupplierNames, ...procSupplierNames])];
      const supplierName = allSuppliers.join(", ") || "—";

      // Customer GST: order-level GST only (order_invoices doesn't carry GST)
      const customerGst = o.customer_gst?.trim() || "—";

      // Inventory fulfillment
      const inventoryFulfilled = orderInvLinks.length > 0;
      const inventorySourcePO = inventoryFulfilled
        ? [...new Set(orderInvLinks.map(l => l.procurement?.po_number || l.procurement?.procurement_number).filter(Boolean))].join(", ") || "—"
        : "—";
      const inventoryCost = orderInvLinks.reduce((sum, l) => {
        const unitPrice = l.procurement?.unit_price || 0;
        return sum + unitPrice * l.quantity_used;
      }, 0);

      const primaryPaymentMode = primaryModeByOrder.get(o.id) ?? null;

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
        procurementCostKnown,
        estimatedProcurementValue,
        estimatedCostKnown,
        estimatedProfit,
        estimatedProfitMargin,
        profit,
        profitMargin,
        orderStatus: o.status,
        paymentStatus: o.payment_status,
        procurementPaymentStatus: procPaymentStatus,
        salesPersonName: o.sales_person_name,
        createdAt: o.created_at,
        orderDate: o.order_date || o.created_at,
        invoiceNumber,
        proformaNumber,
        poNumber,
        supplierName,
        customerGst,
        inventoryFulfilled,
        inventorySourcePO,
        inventoryCost,
        primaryPaymentMode,
      };
    });
  }, [orders, procByOrder, itemsByOrder, invoicesByOrder, zohoInvoicesByOrder, suppliersMap, invLinksByOrder, primaryModeByOrder]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const has = (v: unknown) => typeof v === "string" && v.toLowerCase().includes(q);
    const list = q
      ? rows.filter((r) =>
          has(r.orderNumber) ||
          has(r.customerName) ||
          has(r.customerCompany) ||
          has(r.productName) ||
          has(r.invoiceNumber) ||
          has(r.proformaNumber) ||
          has(r.poNumber) ||
          has(r.supplierName) ||
          has(r.customerGst)
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
    const totalEstProcurement = rows.reduce((s, r) => s + r.estimatedProcurementValue, 0);
    const totalEstProfit = rows.reduce((s, r) => s + r.estimatedProfit, 0);
    const estKnownRows = rows.filter(r => r.estimatedCostKnown);
    const estKnownSales = estKnownRows.reduce((s, r) => s + r.salesValue, 0);
    const estKnownProfit = estKnownRows.reduce((s, r) => s + r.estimatedProfit, 0);
    const avgEstMargin = estKnownSales > 0 ? (estKnownProfit / estKnownSales) * 100 : 0;
    // Margin only over rows where procurement cost is known, so pending-cost
    // orders don't artificially inflate margin.
    const knownRows = rows.filter(r => r.procurementCostKnown);
    const knownSales = knownRows.reduce((s, r) => s + r.salesValue, 0);
    const knownProfit = knownRows.reduce((s, r) => s + r.profit, 0);
    const avgMargin = knownSales > 0 ? (knownProfit / knownSales) * 100 : 0;
    return { totalSales, totalReceived, totalPending, totalProcurement, totalProfit, avgMargin, totalEstProcurement, totalEstProfit, avgEstMargin };
  }, [rows]);

  // Received-by-mode summary (uses each row's primary mode and amountReceived)
  const receivedByMode = useMemo(() => {
    const totals = new Map<string, number>();
    rows.forEach((r) => {
      if (r.amountReceived <= 0) return;
      const key = r.primaryPaymentMode ?? 'unknown';
      totals.set(key, (totals.get(key) ?? 0) + r.amountReceived);
    });
    const total = Array.from(totals.values()).reduce((s, v) => s + v, 0);
    return Array.from(totals.entries())
      .map(([mode, amount]) => ({ mode, amount, pct: total > 0 ? (amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [rows]);

  const handleExportTally = () => {
    const exportRows = filtered.map((r) => ({
      orderNumber: r.orderNumber,
      orderDate: r.orderDate,
      customerName: r.customerName,
      customerCompany: r.customerCompany,
      productName: r.productName,
      invoiceNumber: r.invoiceNumber,
      proformaNumber: r.proformaNumber,
      salesValue: r.salesValue,
      amountReceived: r.amountReceived,
      pendingPayment: r.pendingPayment,
      primaryPaymentMode: getPaymentModeLabel(r.primaryPaymentMode),
      procurementValue: r.procurementValue,
      profit: r.profit,
      profitMargin: Number(r.profitMargin.toFixed(2)),
      paymentStatus: r.paymentStatus,
      supplierName: r.supplierName,
    }));
    exportToExcel(exportRows, `tally-${format(new Date(), 'yyyyMMdd')}`, {
      sheetName: 'Tally',
      amountColumns: ['salesValue', 'amountReceived', 'pendingPayment', 'procurementValue', 'profit'],
      dateColumns: ['orderDate'],
      headers: {
        orderNumber: 'Order #',
        orderDate: 'Order Date',
        customerName: 'Customer',
        customerCompany: 'Company',
        productName: 'Product',
        invoiceNumber: 'Invoice #',
        proformaNumber: 'Proforma #',
        salesValue: 'Sales Value',
        amountReceived: 'Received',
        pendingPayment: 'Pending',
        primaryPaymentMode: 'Primary Payment Mode',
        procurementValue: 'Procurement Cost',
        profit: 'Profit',
        profitMargin: 'Margin %',
        paymentStatus: 'Pay Status',
        supplierName: 'Supplier',
      },
    });
  };

  // Comparison chart: Current month till date vs Previous month same dates
  const comparisonData = useMemo(() => {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const dayOfMonth = now.getDate();
    const prevMonthStart = startOfMonth(subMonths(now, 1));

    // Days 1 to today's date
    const days = Array.from({ length: dayOfMonth }, (_, i) => i + 1);

    return days.map((day) => {
      const currentDate = new Date(currentMonthStart);
      currentDate.setDate(day);
      const prevDate = new Date(prevMonthStart);
      prevDate.setDate(day);

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

  const periodLabels: Record<TimePeriod, string> = {
    today: "Today",
    yesterday: "Yesterday",
    this_week: "This Week",
    last_week: "Last Week",
    this_month: "Month Till Date",
    prev_month: "Previous Month",
    last_3_months: "Last 3 Months",
    this_quarter: "This Quarter",
    last_quarter: "Last Quarter",
    ytd: "Year To Date",
    all: "All Time",
    custom: customStart && customEnd
      ? `${format(customStart, "dd MMM yyyy")} – ${format(customEnd, "dd MMM yyyy")}`
      : "Custom Range",
  };
  const periodLabel = periodLabels[timePeriod];

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
    { label: "Est. Proc. Cost", value: fmt(totals.totalEstProcurement), icon: TrendingDown, color: "text-amber-600", bg: "bg-amber-500/10" },
    { label: "Total Profit", value: fmt(totals.totalProfit), icon: TrendingUp, color: totals.totalProfit >= 0 ? "text-emerald-500" : "text-rose-500", bg: totals.totalProfit >= 0 ? "bg-emerald-500/10" : "bg-rose-500/10" },
    { label: "Est. Profit", value: fmt(totals.totalEstProfit), icon: TrendingUp, color: totals.totalEstProfit >= 0 ? "text-amber-600" : "text-rose-500", bg: "bg-amber-500/10" },
    { label: "Avg Margin", value: `${totals.avgMargin.toFixed(1)}%`, icon: TrendingUp, color: totals.avgMargin >= 0 ? "text-primary" : "text-rose-500", bg: totals.avgMargin >= 0 ? "bg-primary/10" : "bg-rose-500/10" },
  ];

  const formatChartValue = (value: number) => {
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
    return `₹${value}`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Select value={timePeriod} onValueChange={(v) => setTimePeriod(v as TimePeriod)}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="last_week">Last Week</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="prev_month">Previous Month</SelectItem>
              <SelectItem value="last_3_months">Last 3 Months</SelectItem>
              <SelectItem value="this_quarter">This Quarter</SelectItem>
              <SelectItem value="last_quarter">Last Quarter</SelectItem>
              <SelectItem value="ytd">Year To Date</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {timePeriod === "custom" && (
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-9 justify-start text-left font-normal", !customStart && "text-muted-foreground")}>
                  <Calendar className="mr-2 h-4 w-4" />
                  {customStart ? format(customStart, "dd MMM yyyy") : "From"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComp mode="single" selected={customStart} onSelect={setCustomStart} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground text-sm">to</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-9 justify-start text-left font-normal", !customEnd && "text-muted-foreground")}>
                  <Calendar className="mr-2 h-4 w-4" />
                  {customEnd ? format(customEnd, "dd MMM yyyy") : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComp mode="single" selected={customEnd} onSelect={setCustomEnd} disabled={(d) => (customStart ? d < customStart : false)} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
          </div>
        )}
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
        <Badge variant="outline" className="text-xs">
          {periodLabel} · {rows.length} orders
        </Badge>
        <Button variant="outline" size="sm" className="h-9 ml-auto" onClick={handleExportTally} disabled={filtered.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
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

      {/* Received by Payment Mode */}
      <Card className="glass">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <IndianRupee className="h-4 w-4 text-primary" />
            Received by Payment Mode
          </CardTitle>
        </CardHeader>
        <CardContent>
          {receivedByMode.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No received payments in this period.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {receivedByMode.map((r) => (
                <div key={r.mode} className="flex items-center justify-between gap-2 p-2 rounded-md border border-border">
                  <PaymentModeBadge mode={r.mode === 'unknown' ? null : r.mode} short />
                  <div className="text-right">
                    <p className="text-sm font-semibold">{fmt(r.amount)}</p>
                    <p className="text-[10px] text-muted-foreground">{r.pct.toFixed(1)}%</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comparison Chart: Current Month vs Previous Month */}
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
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                  interval={Math.max(0, Math.floor(comparisonData.length / 10) - 1)}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                  tickFormatter={formatChartValue}
                />
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
              <Input placeholder="Search order, customer, invoice, supplier, GST..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><SortBtn field="orderNumber" label="Order #" /></TableHead>
                  <TableHead><SortBtn field="orderDate" label="Order Date" /></TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Proforma #</TableHead>
                  <TableHead>PO #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>GST No.</TableHead>
                  <TableHead>Sales Person</TableHead>
                  <TableHead className="text-right"><SortBtn field="salesValue" label="Sales Value" /></TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right"><SortBtn field="pendingPayment" label="Pending" /></TableHead>
                  <TableHead>Pay Mode</TableHead>
                  <TableHead className="text-right"><SortBtn field="procurementValue" label="Proc. Cost" /></TableHead>
                  <TableHead className="text-right text-amber-700 dark:text-amber-400">Est. Cost</TableHead>
                  <TableHead className="text-right"><SortBtn field="profit" label="Profit" /></TableHead>
                  <TableHead className="text-right text-amber-700 dark:text-amber-400">Est. Profit</TableHead>
                  <TableHead className="text-right"><SortBtn field="profitMargin" label="Margin" /></TableHead>
                  <TableHead>Pay Status</TableHead>
                  <TableHead>Proc Pay</TableHead>
                  <TableHead>Inv. Source</TableHead>
                  <TableHead className="text-right">Inv. Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={23} className="text-center py-10 text-muted-foreground">
                      No orders found for {periodLabel}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.orderId} className="group">
                      <TableCell>
                        <button onClick={() => openOrderDialog(r.orderId)} className="font-mono text-xs font-medium text-primary hover:underline cursor-pointer inline-flex items-center gap-1" title="View Order">
                          {r.orderNumber} <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                        </button>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {r.orderDate ? format(new Date(r.orderDate), "dd MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap min-w-[140px]">{r.invoiceNumber}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap min-w-[140px]">{r.proformaNumber}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap min-w-[120px]">{r.poNumber}</TableCell>
                      <TableCell>
                        <button onClick={() => openOrderDialog(r.orderId)} className="max-w-[140px] text-left cursor-pointer hover:opacity-80" title="View Order">
                          <p className="text-sm font-medium truncate">{r.customerName}</p>
                          <p className="text-xs text-muted-foreground truncate">{r.customerCompany}</p>
                        </button>
                      </TableCell>
                      <TableCell>
                        <button onClick={() => openOrderDialog(r.orderId)} className="text-sm max-w-[120px] truncate cursor-pointer hover:text-primary transition-colors" title="View Order">
                          {r.productName}
                        </button>
                      </TableCell>
                      <TableCell>
                        {r.supplierName !== "—" ? (
                          <button onClick={() => openProcDialog(r.orderId)} className="text-xs text-primary hover:underline cursor-pointer max-w-[100px] truncate" title="View Procurement">
                            {r.supplierName}
                          </button>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground max-w-[100px] truncate">{r.customerGst}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[100px] truncate">{r.salesPersonName}</TableCell>
                      <TableCell className="text-right">
                        <button onClick={() => openOrderDialog(r.orderId)} className="font-medium text-sm cursor-pointer hover:text-primary transition-colors" title="View Order">
                          {fmt(r.salesValue)}
                        </button>
                      </TableCell>
                      <TableCell className="text-right text-sm text-emerald-600 dark:text-emerald-400">
                        <button onClick={() => openOrderDialog(r.orderId)} className="cursor-pointer hover:underline" title="View Payment Details">
                          {fmt(r.amountReceived)}
                        </button>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <button onClick={() => openOrderDialog(r.orderId)} className={`cursor-pointer hover:underline ${r.pendingPayment > 0 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}`} title="View Payment Details">
                          {fmt(r.pendingPayment)}
                        </button>
                      </TableCell>
                      <TableCell>
                        <PaymentModeBadge mode={r.primaryPaymentMode} short />
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          onClick={() => openProcDialog(r.orderId)}
                          className={`text-sm cursor-pointer hover:text-primary hover:underline transition-colors ${r.procurementCostKnown ? '' : 'text-muted-foreground italic'}`}
                          title={r.procurementCostKnown ? 'View Procurement' : 'Supplier pricing not set yet — update procurement to see cost'}
                        >
                          {r.procurementCostKnown ? fmt(r.procurementValue) : 'Not set'}
                        </button>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {r.estimatedCostKnown ? (
                          <button
                            onClick={() => openProcDialog(r.orderId)}
                            className={`cursor-pointer hover:underline ${r.procurementCostKnown ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400 font-medium'}`}
                            title={r.procurementCostKnown ? 'Actual cost is set; estimate mirrors actual' : 'Supply chain estimated cost'}
                          >
                            {fmt(r.estimatedProcurementValue)}
                          </button>
                        ) : (
                          <span className="text-muted-foreground italic" title="No estimate set">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {r.procurementCostKnown ? (
                          <span className={r.profit >= 0 ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-rose-600 dark:text-rose-400 font-medium"}>
                            {fmt(r.profit)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground" title="Awaiting procurement cost">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {r.estimatedCostKnown ? (
                          <span
                            className={r.estimatedProfit >= 0 ? "text-amber-700 dark:text-amber-400 font-medium" : "text-rose-600 dark:text-rose-400 font-medium"}
                            title={r.procurementCostKnown ? 'Mirrors actual profit' : 'Estimated profit using supply chain estimate'}
                          >
                            {fmt(r.estimatedProfit)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {r.procurementCostKnown ? (
                          <span className={r.profitMargin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                            {r.profitMargin.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <button onClick={() => openOrderDialog(r.orderId)} className="cursor-pointer hover:opacity-80 transition-opacity" title="View Payment Details">
                          <PayBadge status={r.paymentStatus} />
                        </button>
                      </TableCell>
                      <TableCell>
                        <button onClick={() => openProcDialog(r.orderId)} className="cursor-pointer hover:opacity-80 transition-opacity" title="View Procurement Payment Details">
                          <ProcPayBadge status={r.procurementPaymentStatus} />
                        </button>
                      </TableCell>
                      <TableCell>
                        {r.inventoryFulfilled ? (
                          <div className="space-y-0.5">
                            <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">Inventory</Badge>
                            <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[100px]">{r.inventorySourcePO}</p>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.inventoryCost > 0 ? (
                          <span className="text-sm font-medium">{fmt(r.inventoryCost)}</span>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
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

      {/* Loading overlay for dialog fetch */}
      {dialogLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="animate-pulse text-muted-foreground text-sm">Loading details...</div>
        </div>
      )}

      {/* Order Detail Dialog */}
      <OrderDialog
        order={selectedFullOrder}
        open={orderDialogOpen}
        onOpenChange={(open) => { setOrderDialogOpen(open); if (!open) setSelectedFullOrder(null); }}
        onUpdate={handleOrderUpdate}
        onDelete={handleOrderDelete}
      />

      {/* Procurement Detail Dialog */}
      <ProcurementOrderDialog
        order={selectedFullOrder}
        suppliers={suppliersList}
        open={procDialogOpen}
        onOpenChange={(open) => { setProcDialogOpen(open); if (!open) setSelectedFullOrder(null); }}
        onUpdate={handleOrderUpdate}
      />
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
