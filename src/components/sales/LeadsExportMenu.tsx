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
import { useTableExport } from "@/hooks/useTableExport";

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
  /** Base filename without extension, e.g. "myoperator-leads". */
  filename: string;
  /** Human title used as the PDF heading and Excel sheet name. */
  title: string;
  size?: "sm" | "default";
  className?: string;
}

function cell(value: unknown, isDate?: boolean): string {
  if (value === null || value === undefined || value === "") return "";
  if (isDate) {
    const d = value instanceof Date ? value : new Date(String(value));
    return isValid(d) ? formatDate(d, "dd MMM yyyy HH:mm") : String(value);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Shared Excel + PDF export control for every leads channel table.
 * Exports exactly the rows handed in (i.e. the currently filtered view).
 */
export function LeadsExportMenu<T>({ rows, columns, filename, title, size = "sm", className }: Props<T>) {
  const { exportToExcel } = useTableExport();
  const disabled = !rows || rows.length === 0;

  const handleExcel = () => {
    const shaped = rows.map((row) => {
      const out: Record<string, string> = {};
      for (const col of columns) out[col.label] = cell(col.value(row), col.date);
      return out;
    });
    exportToExcel(shaped, filename, { sheetName: title.slice(0, 28) });
  };

  const handlePdf = () => {
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(14);
      doc.text(title, 40, 40);
      doc.setFontSize(9);
      doc.text(
        `${rows.length} record(s) · exported ${formatDate(new Date(), "dd MMM yyyy HH:mm")}`,
        40,
        56,
      );
      autoTable(doc, {
        startY: 70,
        head: [columns.map((c) => c.label)],
        body: rows.map((row) => columns.map((c) => cell(c.value(row), c.date))),
        styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7.5 },
        alternateRowStyles: { fillColor: [244, 246, 250] },
        margin: { left: 30, right: 30 },
      });
      const finalName = `${filename}-${formatDate(new Date(), "yyyyMMdd-HHmm")}.pdf`;
      doc.save(finalName);
      toast.success(`Exported ${rows.length} rows`, { description: finalName });
    } catch (err) {
      toast.error("PDF export failed", {
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
        <DropdownMenuItem onClick={handleExcel} className="gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePdf} className="gap-2">
          <FileText className="h-4 w-4" />
          PDF (.pdf)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}