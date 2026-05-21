import { useCallback } from "react";
import * as XLSX from "xlsx";
import { format as formatDate, isValid } from "date-fns";
import { toast } from "sonner";

export type ExportRow = Record<string, unknown>;

interface ExportOptions {
  /** Explicit column order. If omitted, derived from first row's keys. */
  columns?: string[];
  /** Keys whose numeric values should be formatted as Indian Rupee. */
  amountColumns?: string[];
  /** Keys whose values should be formatted as dd MMM yyyy. */
  dateColumns?: string[];
  /** Optional human-friendly header map (key -> label). */
  headers?: Record<string, string>;
  /** Sheet name for Excel exports (default: "Sheet1"). */
  sheetName?: string;
}

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function formatCell(value: unknown, key: string, opts: ExportOptions): string | number {
  if (value === null || value === undefined || value === "") return "";
  if (opts.amountColumns?.includes(key) && typeof value === "number") {
    return INR.format(value);
  }
  if (opts.dateColumns?.includes(key)) {
    const d = value instanceof Date ? value : new Date(String(value));
    if (isValid(d)) return formatDate(d, "dd MMM yyyy");
    return String(value);
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value as string | number;
}

function shapeRows(rows: ExportRow[], opts: ExportOptions) {
  if (rows.length === 0) return [] as Record<string, string | number>[];
  const cols = opts.columns ?? Object.keys(rows[0]);
  const headers = opts.headers ?? {};
  return rows.map((row) => {
    const out: Record<string, string | number> = {};
    for (const key of cols) {
      const label = headers[key] ?? key;
      out[label] = formatCell(row[key], key, opts);
    }
    return out;
  });
}

function appendTimestamp(filename: string): string {
  const stamp = formatDate(new Date(), "yyyyMMdd-HHmm");
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return `${filename}-${stamp}`;
  return `${filename.slice(0, dot)}-${stamp}${filename.slice(dot)}`;
}

/**
 * Hook returning memoized helpers to export an array of plain rows to
 * Excel or CSV. Both functions handle empty input gracefully and surface
 * a toast on success/failure.
 */
export function useTableExport() {
  const exportToExcel = useCallback(
    (rows: ExportRow[], filename: string, opts: ExportOptions = {}) => {
      try {
        if (!rows || rows.length === 0) {
          toast.warning("Nothing to export", { description: "No rows match the current view." });
          return;
        }
        const shaped = shapeRows(rows, opts);
        const ws = XLSX.utils.json_to_sheet(shaped);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, opts.sheetName ?? "Sheet1");
        const finalName = appendTimestamp(filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
        XLSX.writeFile(wb, finalName);
        toast.success(`Exported ${rows.length} rows`, { description: finalName });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Export failed";
        toast.error("Export failed", { description: msg });
      }
    },
    [],
  );

  const exportToCsv = useCallback(
    (rows: ExportRow[], filename: string, opts: ExportOptions = {}) => {
      try {
        if (!rows || rows.length === 0) {
          toast.warning("Nothing to export", { description: "No rows match the current view." });
          return;
        }
        const shaped = shapeRows(rows, opts);
        const ws = XLSX.utils.json_to_sheet(shaped);
        const csv = XLSX.utils.sheet_to_csv(ws);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const finalName = appendTimestamp(filename.endsWith(".csv") ? filename : `${filename}.csv`);
        a.href = url;
        a.download = finalName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(`Exported ${rows.length} rows`, { description: finalName });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Export failed";
        toast.error("Export failed", { description: msg });
      }
    },
    [],
  );

  return { exportToExcel, exportToCsv };
}