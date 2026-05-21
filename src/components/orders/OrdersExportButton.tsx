import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useTableExport } from "@/hooks/useTableExport";

interface OrdersExportButtonProps {
  activeTab: string;
  manualOrders: any[];
  shopifyOrders: any[];
  wooOrders: any[];
}

const SHARED_HEADERS: Record<string, string> = {
  order_number: "Order #",
  order_date: "Order Date",
  customer_name: "Customer",
  customer_company: "Company",
  customer_email: "Email",
  product_name: "Product",
  quantity: "Qty",
  selling_price: "Selling Price",
  total: "Total",
  payment_status: "Payment",
  status: "Status",
  source: "Source",
};

function mapManual(o: any) {
  return {
    order_number: o.order_number,
    order_date: o.order_date || o.created_at,
    customer_name: o.customer_name,
    customer_company: o.customer_company,
    customer_email: o.customer_email,
    product_name: o.product_name,
    quantity: o.quantity,
    selling_price: o.selling_price ?? null,
    total: (o.selling_price ?? 0) * (o.quantity ?? 0),
    payment_status: o.payment_status,
    status: o.status,
    source: "manual",
  };
}

function mapShopify(o: any) {
  return {
    order_number: o.order_number || o.shopify_order_id,
    order_date: o.order_date || o.created_at,
    customer_name: o.customer_name,
    customer_company: o.customer_company ?? "",
    customer_email: o.customer_email,
    product_name: o.line_items_summary || o.product_name,
    quantity: o.total_items ?? o.quantity,
    selling_price: o.total_price ?? null,
    total: o.total_price ?? 0,
    payment_status: o.financial_status || o.payment_status,
    status: o.fulfillment_status || o.status,
    source: "shopify",
  };
}

function mapWoo(o: any) {
  return {
    order_number: o.order_number || o.woo_order_id,
    order_date: o.order_date || o.created_at,
    customer_name: o.customer_name,
    customer_company: "",
    customer_email: o.customer_email,
    product_name: o.product_name,
    quantity: o.quantity ?? 1,
    selling_price: o.total ?? null,
    total: o.total ?? 0,
    payment_status: o.payment_status,
    status: o.order_status,
    source: "woocommerce",
  };
}

export function OrdersExportButton({ activeTab, manualOrders, shopifyOrders, wooOrders }: OrdersExportButtonProps) {
  const { exportToExcel } = useTableExport();

  const tabConfig = (() => {
    switch (activeTab) {
      case "shopify":
        return { rows: shopifyOrders.map(mapShopify), name: "orders-shopify" };
      case "website":
        return { rows: wooOrders.map(mapWoo), name: "orders-website" };
      case "list":
      default:
        return { rows: manualOrders.map(mapManual), name: "orders-manual" };
    }
  })();

  const exportable = ["list", "shopify", "website"].includes(activeTab);
  if (!exportable) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() =>
        exportToExcel(tabConfig.rows, tabConfig.name, {
          sheetName: "Orders",
          amountColumns: ["selling_price", "total"],
          dateColumns: ["order_date"],
          headers: SHARED_HEADERS,
        })
      }
      disabled={tabConfig.rows.length === 0}
      className="gap-2 self-start"
    >
      <Download className="h-4 w-4" />
      Export
    </Button>
  );
}