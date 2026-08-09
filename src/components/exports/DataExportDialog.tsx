import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useTableExport } from "@/hooks/useTableExport";

type Row = Record<string, any>;

interface Dataset {
  key: string;
  label: string;
  hint: string;
  table: string;
  columns: string[];
  orderBy: string;
  /** Optional post-processing (e.g. dedupe into a customer database). */
  transform?: (rows: Row[]) => Row[];
  headers?: Record<string, string>;
  amountColumns?: string[];
  dateColumns?: string[];
}

const ORDER_COLS = [
  "order_number", "order_date", "customer_name", "customer_company", "customer_email",
  "customer_phone", "customer_gst", "product_name", "product_category", "quantity",
  "selling_price", "discount_amount", "total_sales_amount", "amount_paid", "payment_status",
  "status", "source", "lead_source", "sales_person_name", "shipping_address", "created_at",
];

function customerDatabase(rows: Row[]): Row[] {
  const map = new Map<string, Row>();
  for (const r of rows) {
    const key = (r.customer_phone || r.customer_email || r.customer_name || "unknown")
      .toString().trim().toLowerCase();
    const value = (Number(r.total_sales_amount) || 0);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        customer_name: r.customer_name,
        customer_company: r.customer_company,
        customer_email: r.customer_email,
        customer_phone: r.customer_phone,
        customer_gst: r.customer_gst,
        customer_type: r.customer_type,
        city: r.shipping_address,
        orders_count: 1,
        total_value: value,
        first_order_date: r.order_date || r.created_at,
        last_order_date: r.order_date || r.created_at,
        sales_person_name: r.sales_person_name,
      });
    } else {
      existing.orders_count += 1;
      existing.total_value += value;
      const d = r.order_date || r.created_at;
      if (d && d < existing.first_order_date) existing.first_order_date = d;
      if (d && d > existing.last_order_date) existing.last_order_date = d;
      existing.customer_email = existing.customer_email || r.customer_email;
      existing.customer_phone = existing.customer_phone || r.customer_phone;
      existing.customer_company = existing.customer_company || r.customer_company;
    }
  }
  return [...map.values()].sort((a, b) => (b.total_value || 0) - (a.total_value || 0));
}

const DATASETS: Dataset[] = [
  {
    key: "customers",
    label: "Customer database",
    hint: "One row per customer with order count, lifetime value and contact details",
    table: "orders",
    columns: [...ORDER_COLS, "customer_type"],
    orderBy: "order_date",
    transform: customerDatabase,
    amountColumns: ["total_value"],
    dateColumns: ["first_order_date", "last_order_date"],
  },
  {
    key: "orders",
    label: "Orders (all)",
    hint: "Every order line with pricing, payment and delivery status",
    table: "orders",
    columns: ORDER_COLS,
    orderBy: "order_date",
    amountColumns: ["selling_price", "discount_amount", "total_sales_amount", "amount_paid"],
    dateColumns: ["order_date", "created_at"],
  },
  {
    key: "qforms",
    label: "Website / QForms leads",
    hint: "Website form submissions (leads)",
    table: "leads",
    columns: [
      "created_at", "form_type", "name", "email", "phone", "company", "subject", "message",
      "location", "sector", "urgency", "page_url", "source", "status", "disposition",
      "assigned_to_name", "is_enquiry_converted",
    ],
    orderBy: "created_at",
    dateColumns: ["created_at"],
  },
  {
    key: "myoperator",
    label: "MyOperator calls",
    hint: "Inbound/outbound call logs with disposition",
    table: "call_logs",
    columns: [
      "created_at", "start_time", "caller_number", "full_number", "customer_name",
      "customer_company", "email", "city", "call_type", "call_status", "call_duration",
      "department", "agent_name", "assigned_agent_name", "product_name", "lead_source",
      "disposition", "sales_person_name", "is_enquiry_converted",
    ],
    orderBy: "created_at",
    dateColumns: ["created_at", "start_time"],
  },
  {
    key: "email",
    label: "Email leads",
    hint: "Leads parsed from the sales inbox",
    table: "email_leads",
    columns: [
      "created_at", "customer_name", "customer_company", "email", "phone_number", "city",
      "product_name", "product_category", "quantity", "lead_source", "mail_source", "urgency",
      "subject", "notes", "status", "disposition", "sales_person_name", "assigned_to_name",
      "is_enquiry_converted",
    ],
    orderBy: "created_at",
    dateColumns: ["created_at"],
  },
  {
    key: "google_ads",
    label: "Google Ads leads",
    hint: "Lead-form submissions synced from Google Ads",
    table: "google_ads_leads",
    columns: [
      "created_at", "customer_name", "customer_company", "email", "phone", "city",
      "customer_state", "product_name", "product_category", "quantity", "campaign_name",
      "urgency", "lead_temperature", "status", "disposition", "sales_person_name",
      "assigned_to_name", "is_converted", "conversion_value",
    ],
    orderBy: "created_at",
    amountColumns: ["conversion_value"],
    dateColumns: ["created_at"],
  },
  {
    key: "interakt",
    label: "Interakt (WhatsApp) leads",
    hint: "WhatsApp contacts synced from Interakt",
    table: "interakt_leads",
    columns: [
      "created_at", "interakt_created_at", "customer_name", "company", "email",
      "country_code", "phone_number", "city", "product_name", "source", "lead_source",
      "status", "disposition", "sales_person_name", "assigned_to_name", "is_enquiry_converted",
    ],
    orderBy: "created_at",
    dateColumns: ["created_at", "interakt_created_at"],
  },
  {
    key: "form_leads",
    label: "Internal form leads",
    hint: "Submissions from internal embeddable forms",
    table: "form_leads",
    columns: [
      "created_at", "form_name", "customer_name", "email", "phone", "company", "city",
      "product_name", "notes", "status", "disposition", "sales_person_name",
      "assigned_to_name", "is_enquiry_converted",
    ],
    orderBy: "created_at",
    dateColumns: ["created_at"],
  },
];

const PAGE = 1000;
const MAX_ROWS = 20000;

async function fetchAll(ds: Dataset): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let query = supabase
      .from(ds.table as any)
      .select(ds.columns.join(", "))
      .order(ds.orderBy, { ascending: false })
      .range(from, from + PAGE - 1);
    if (ds.table === "orders") query = query.is("deleted_at", null);
    const { data, error } = await query;
    if (error) throw error;
    const batch = (data as unknown as Row[]) ?? [];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

/**
 * Central download hub: exports the full customer database, all orders, and every
 * lead channel (QForms, MyOperator, Email, Google Ads, Interakt, internal forms)
 * to Excel or CSV. Rows come straight from the backend, so exports are not limited
 * to what is loaded on screen — RLS still applies per user.
 */
export function DataExportDialog({ triggerLabel = "Download" }: { triggerLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { exportToExcel, exportToCsv } = useTableExport();

  const run = async (ds: Dataset, kind: "excel" | "csv") => {
    setBusy(`${ds.key}:${kind}`);
    const t = toast.loading(`Preparing ${ds.label}…`);
    try {
      const raw = await fetchAll(ds);
      const rows = ds.transform ? ds.transform(raw) : raw;
      toast.dismiss(t);
      const opts = {
        sheetName: ds.label.slice(0, 28),
        amountColumns: ds.amountColumns,
        dateColumns: ds.dateColumns,
        headers: ds.headers,
      };
      const name = `xboom-${ds.key}`;
      if (kind === "excel") exportToExcel(rows, name, opts);
      else exportToCsv(rows, name, opts);
    } catch (err) {
      toast.dismiss(t);
      toast.error("Export failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 self-start">
          <Download className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Download data</DialogTitle>
          <DialogDescription>
            Export the full customer database, orders, or any lead channel. Only records you
            are allowed to see are included.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-2">
          {DATASETS.map((ds) => (
            <div
              key={ds.key}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{ds.label}</span>
                  {ds.transform && <Badge variant="secondary" className="text-[10px]">deduped</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{ds.hint}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={busy !== null}
                  onClick={() => void run(ds, "excel")}
                >
                  {busy === `${ds.key}:excel`
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <FileSpreadsheet className="h-3.5 w-3.5" />}
                  Excel
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  disabled={busy !== null}
                  onClick={() => void run(ds, "csv")}
                >
                  {busy === `${ds.key}:csv`
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <FileText className="h-3.5 w-3.5" />}
                  CSV
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}