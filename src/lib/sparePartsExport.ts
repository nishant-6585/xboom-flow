import type { SparePart } from "@/hooks/useSpareParts";

function toCsvValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportSparePartsCsv(parts: SparePart[], includePricing: boolean) {
  const headers = [
    "Part Code",
    "Part Name",
    "Category",
    "Vendor",
    "Quantity",
    "Stock Status",
    ...(includePricing
      ? ["Cost Price", "Selling Price", "Profit / Unit", "Margin %", "Inventory Value"]
      : []),
    "Last Updated",
  ];
  const rows = parts.map((p) => [
    p.part_code,
    p.part_name,
    p.category,
    p.vendor_name,
    p.quantity,
    p.stock_status,
    ...(includePricing
      ? [
          p.cost_price,
          p.selling_price,
          p.profit_per_unit,
          Number(p.profit_margin_percent).toFixed(2),
          Number(p.cost_price) * Number(p.quantity),
        ]
      : []),
    p.updated_at,
  ]);
  const csv = [headers, ...rows].map((r) => r.map(toCsvValue).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `spare-parts-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}