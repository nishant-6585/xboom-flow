import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileSpreadsheet, AlertCircle, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { AssetType, AssetStatus, ASSET_TYPES, ASSET_STATUSES } from "@/hooks/useEmployeeAssets";

interface Employee {
  id: string;
  name: string;
}

interface ParsedAsset {
  employee_name: string;
  employee_id?: string;
  asset_type: AssetType;
  asset_name: string;
  brand?: string;
  model?: string;
  serial_number?: string;
  imei_number?: string;
  sim_number?: string;
  phone_number?: string;
  purchase_date?: string;
  purchase_price?: number;
  assigned_date: string;
  status: AssetStatus;
  condition_on_assign?: string;
  notes?: string;
  error?: string;
}

interface AssetImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (assets: ParsedAsset[]) => Promise<void>;
  employees: Employee[];
}

export function AssetImportDialog({
  open,
  onOpenChange,
  onImport,
  employees,
}: AssetImportDialogProps) {
  const [parsedData, setParsedData] = useState<ParsedAsset[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const templateData = [
      {
        "Employee Name": "John Doe",
        "Asset Type": "mobile_phone",
        "Asset Name": "iPhone 15 Pro",
        "Brand": "Apple",
        "Model": "A3090",
        "Serial Number": "ABC123456",
        "IMEI Number": "123456789012345",
        "SIM Number": "SIM001",
        "Phone Number": "+91 98765 43210",
        "Purchase Date": "2024-01-15",
        "Purchase Price": 129900,
        "Assigned Date": "2024-01-20",
        "Status": "assigned",
        "Condition on Assign": "New",
        "Notes": "Company phone for sales team",
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Assets Template");

    // Add a reference sheet for valid values
    const refData = [
      { "Field": "Asset Type", "Valid Values": ASSET_TYPES.map(t => t.value).join(", ") },
      { "Field": "Status", "Valid Values": ASSET_STATUSES.map(s => s.value).join(", ") },
      { "Field": "Employee Name", "Valid Values": "Must match exactly with existing employee names" },
    ];
    const refWs = XLSX.utils.json_to_sheet(refData);
    XLSX.utils.book_append_sheet(wb, refWs, "Reference");

    XLSX.writeFile(wb, "asset_import_template.xlsx");
  };

  const parseAssetType = (value: string): AssetType | null => {
    const normalized = value?.toLowerCase().trim().replace(/\s+/g, '_');
    const found = ASSET_TYPES.find(t => t.value === normalized || t.label.toLowerCase() === value?.toLowerCase().trim());
    return found?.value || null;
  };

  const parseStatus = (value: string): AssetStatus | null => {
    const normalized = value?.toLowerCase().trim().replace(/\s+/g, '_');
    const found = ASSET_STATUSES.find(s => s.value === normalized || s.label.toLowerCase() === value?.toLowerCase().trim());
    return found?.value || null;
  };

  const findEmployee = (name: string): Employee | undefined => {
    return employees.find(e => e.name.toLowerCase().trim() === name?.toLowerCase().trim());
  };

  const parseDate = (value: any): string | undefined => {
    if (!value) return undefined;
    if (typeof value === 'number') {
      // Excel date serial number
      const date = XLSX.SSF.parse_date_code(value);
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
    }
    return undefined;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        const parsed: ParsedAsset[] = [];
        const parseErrors: string[] = [];

        jsonData.forEach((row: any, index: number) => {
          const rowNum = index + 2; // Excel rows start at 1, plus header
          const errors: string[] = [];

          const employeeName = row["Employee Name"]?.toString().trim();
          const employee = findEmployee(employeeName);
          if (!employee && employeeName) {
            errors.push(`Employee "${employeeName}" not found`);
          }

          const assetType = parseAssetType(row["Asset Type"]);
          if (!assetType) {
            errors.push(`Invalid asset type: ${row["Asset Type"]}`);
          }

          const status = parseStatus(row["Status"]) || "assigned";
          const assignedDate = parseDate(row["Assigned Date"]) || new Date().toISOString().split('T')[0];

          if (!row["Asset Name"]?.toString().trim()) {
            errors.push("Asset name is required");
          }

          const asset: ParsedAsset = {
            employee_name: employeeName || "",
            employee_id: employee?.id,
            asset_type: assetType || "other",
            asset_name: row["Asset Name"]?.toString().trim() || "",
            brand: row["Brand"]?.toString().trim(),
            model: row["Model"]?.toString().trim(),
            serial_number: row["Serial Number"]?.toString().trim(),
            imei_number: row["IMEI Number"]?.toString().trim(),
            sim_number: row["SIM Number"]?.toString().trim(),
            phone_number: row["Phone Number"]?.toString().trim(),
            purchase_date: parseDate(row["Purchase Date"]),
            purchase_price: row["Purchase Price"] ? Number(row["Purchase Price"]) : undefined,
            assigned_date: assignedDate,
            status: status,
            condition_on_assign: row["Condition on Assign"]?.toString().trim(),
            notes: row["Notes"]?.toString().trim(),
            error: errors.length > 0 ? errors.join("; ") : undefined,
          };

          parsed.push(asset);

          if (errors.length > 0) {
            parseErrors.push(`Row ${rowNum}: ${errors.join(", ")}`);
          }
        });

        setParsedData(parsed);
        setErrors(parseErrors);
      } catch (error) {
        console.error("Error parsing file:", error);
        setErrors(["Failed to parse file. Please ensure it's a valid Excel or CSV file."]);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    const validAssets = parsedData.filter(a => !a.error && a.employee_id);
    if (validAssets.length === 0) {
      setErrors(["No valid assets to import"]);
      return;
    }

    setImporting(true);
    try {
      await onImport(validAssets);
      onOpenChange(false);
      setParsedData([]);
      setErrors([]);
      setFileName("");
    } catch (error: any) {
      setErrors([error.message || "Failed to import assets"]);
    } finally {
      setImporting(false);
    }
  };

  const validCount = parsedData.filter(a => !a.error && a.employee_id).length;
  const errorCount = parsedData.filter(a => a.error || !a.employee_id).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Import Assets</DialogTitle>
          <DialogDescription>
            Upload an Excel file to bulk import assets. Download the template first to see the required format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-3">
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>

            <div className="flex-1">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full"
              >
                <Upload className="mr-2 h-4 w-4" />
                {fileName || "Choose File"}
              </Button>
            </div>
          </div>

          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc list-inside text-sm">
                  {errors.slice(0, 5).map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                  {errors.length > 5 && <li>...and {errors.length - 5} more errors</li>}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {parsedData.length > 0 && (
            <>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-green-600 font-medium">{validCount} valid</span>
                {errorCount > 0 && (
                  <span className="text-destructive font-medium">{errorCount} with errors</span>
                )}
              </div>

              <ScrollArea className="h-[300px] border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Asset Type</TableHead>
                      <TableHead>Asset Name</TableHead>
                      <TableHead>Serial #</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.map((asset, i) => (
                      <TableRow key={i} className={asset.error ? "bg-destructive/10" : ""}>
                        <TableCell>{asset.employee_name}</TableCell>
                        <TableCell>{ASSET_TYPES.find(t => t.value === asset.asset_type)?.label}</TableCell>
                        <TableCell>{asset.asset_name}</TableCell>
                        <TableCell>{asset.serial_number || "-"}</TableCell>
                        <TableCell>{ASSET_STATUSES.find(s => s.value === asset.status)?.label}</TableCell>
                        <TableCell className="text-destructive text-xs">
                          {asset.error || (!asset.employee_id ? "Employee not matched" : "-")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={importing || validCount === 0}
          >
            {importing ? "Importing..." : `Import ${validCount} Assets`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
