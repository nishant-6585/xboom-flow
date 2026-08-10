import { Download, FileSpreadsheet, FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format as formatDate, isValid } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTableExport, downloadBlob } from "@/hooks/useTableExport";

export interface LeadsExportColumn<T> {
  /** Column header shown in Excel/PDF. */
  label: string;
  /** Value extractor; return primitives (strings/numbers) or null. */
  value: (row: T) => unknown;
  /** Treat the value as a date and format it as dd MMM yyyy HH:mm. */
  date?: boolean;
}

interface Props<T> {
  rows: T[];
  columns: LeadsExportColumn<T>[];
  /**
   * Optional loader that returns EVERY row matching the current filters
   * (used by server-paginated panels so exports aren't limited to one page).
   */
  fetchAllRows?: () => Promise<T[]>;
  /** Total matching row count across pages (for the "all" menu label). */
  totalCount?: number;
  /** Base filename without extension, e.g. "myoperator-leads". */
  filename: string;
  /** Human title used as the PDF heading and Excel sheet name. */
  title: string;
  size?: "sm" | "default";
  className?: string;
}

// Excel hard limit for a single cell's text length.
const EXCEL_CELL_LIMIT = 32767;

function clampCell(text: string): string {
  // Strip control characters Excel rejects, then clamp to the cell limit.
  const clean = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
  return clean.length > EXCEL_CELL_LIMIT
    ? `${clean.slice(0, EXCEL_CELL_LIMIT - 3)}...`
    : clean;
}

function cell(value: unknown, isDate?: boolean): string {
  if (value === null || value === undefined || value === "") return "";
  if (isDate) {
    const d = value instanceof Date ? value : new Date(String(value));
    return isValid(d) ? formatDate(d, "dd MMM yyyy HH:mm") : clampCell(String(value));
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    try {
      return clampCell(JSON.stringify(value));
    } catch {
      return clampCell(String(value));
    }
  }
  return clampCell(String(value));
}

/**
 * Shared Excel + PDF export control for every leads channel table.
 * Exports exactly the rows handed in (i.e. the currently filtered view).
 */
export function LeadsExportMenu<T>({
  rows,
  columns,
  fetchAllRows,
  totalCount,
  filename,
  title,
  size = "sm",
  className,
}: Props<T>) {
  const { exportToExcel } = useTableExport();
  const disabled = !rows || rows.length === 0;

  const handleExcel = (data: T[] = rows) => {
    try {
      const shaped = data.map((row) => {
        const out: Record<string, string> = {};
        for (const col of columns) {
          let v: unknown = null;
          try {
            v = col.value(row);
          } catch {
            v = null;
          }
          out[col.label] = cell(v, col.date);
        }
        return out;
      });
      exportToExcel(shaped, filename, { sheetName: title.slice(0, 28) });
    } catch (err) {
      toast.error("Excel export failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const handlePdf = (data: T[] = rows) => {
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(14);
      doc.text(title, 40, 40);
      doc.setFontSize(9);
      doc.text(
        `${data.length} record(s) · exported ${formatDate(new Date(), "dd MMM yyyy HH:mm")}`,
        40,
        56,
      );
      autoTable(doc, {
        startY: 70,
        head: [columns.map((c) => c.label)],
        body: data.map((row) => columns.map((c) => cell(c.value(row), c.date))),
        styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7.5 },
        alternateRowStyles: { fillColor: [244, 246, 250] },
        margin: { left: 30, right: 30 },
      });
      const finalName = `${filename}-${formatDate(new Date(), "yyyyMMdd-HHmm")}.pdf`;
      downloadBlob(doc.output("blob"), finalName);
      toast.success(`Exported ${data.length} rows`, { description: finalName });
    } catch (err) {
      toast.error("PDF export failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const handleAll = async (kind: "excel" | "pdf") => {
    if (!fetchAllRows) return;
    const t = toast.loading("Preparing export…");
    try {
      const all = await fetchAllRows();
      toast.dismiss(t);
      if (all.length === 0) {
        toast.warning("Nothing to export");
        return;
      }
      if (kind === "excel") handleExcel(all);
      else handlePdf(all);
    } catch (err) {
      toast.dismiss(t);
      toast.error("Export failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} className={className} disabled={disabled}>
          <Download className="h-4 w-4 mr-1.5" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {rows.length} row(s) in view
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleExcel()} className="gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePdf()} className="gap-2">
          <FileText className="h-4 w-4" />
          PDF (.pdf)
        </DropdownMenuItem>
        {fetchAllRows && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              All {totalCount ? totalCount.toLocaleString() : ""} matching row(s)
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void handleAll("excel"); }} className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              All rows — Excel
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void handleAll("pdf"); }} className="gap-2">
              <FileText className="h-4 w-4" />
              All rows — PDF
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}