import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Download, FileSpreadsheet, AlertTriangle, CheckCircle, Loader2, RefreshCw } from "lucide-react";
import { SalarySheet, SalarySheetEntry, calculateNetPay } from "@/hooks/useSalarySheets";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { recordAuditLog } from "@/lib/auditLog";
import { toast } from "sonner";

const MONTH_SHORT = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Props {
  sheet: SalarySheet;
  entries: SalarySheetEntry[];
}

interface ValidationError {
  employeeName: string;
  employeeId: string;
  errors: string[];
}

interface ExistingFile {
  id: string;
  file_url: string | null;
  employee_count: number;
  total_amount: number;
  generated_at: string;
  generated_by_name: string;
}

const BANK_ACCOUNT_REGEX = /^\d{9,18}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function validateBankDetails(entries: SalarySheetEntry[]): { valid: SalarySheetEntry[]; errors: ValidationError[] } {
  const valid: SalarySheetEntry[] = [];
  const errors: ValidationError[] = [];

  for (const entry of entries) {
    const netPay = calculateNetPay(entry);
    if (netPay <= 0) continue; // Skip zero/negative net pay employees

    const entryErrors: string[] = [];
    const acct = (entry.bank_account || "").replace(/\s/g, "");
    const ifsc = (entry.ifsc_code || "").replace(/\s/g, "").toUpperCase();

    if (!acct) {
      entryErrors.push("Bank account number missing");
    } else if (!BANK_ACCOUNT_REGEX.test(acct)) {
      entryErrors.push("Bank account must be 9–18 digits");
    }

    if (!ifsc) {
      entryErrors.push("IFSC code missing");
    } else if (!IFSC_REGEX.test(ifsc)) {
      entryErrors.push("Invalid IFSC format (e.g. ICIC0001234)");
    }

    if (entryErrors.length > 0) {
      errors.push({ employeeName: entry.employee_name, employeeId: entry.employee_id, errors: entryErrors });
    } else {
      valid.push(entry);
    }
  }

  return { valid, errors };
}

function generateCSV(entries: SalarySheetEntry[], month: number, year: number): string {
  const header = "Account Number,Account Holder Name,IFSC Code,Amount,Payment Reference,Remarks";
  const rows = entries.map((e) => {
    const netPay = calculateNetPay(e);
    const acct = (e.bank_account || "").replace(/\s/g, "");
    const ifsc = (e.ifsc_code || "").replace(/\s/g, "").toUpperCase();
    const ref = `Salary_${MONTH_SHORT[month]}_${year}`;
    const name = e.employee_name.replace(/,/g, " ");
    return `${acct},${name},${ifsc},${netPay.toFixed(2)},${ref},Salary Payment`;
  });
  return [header, ...rows].join("\n");
}

export function BankTransferFileGenerator({ sheet, entries }: Props) {
  const { user, profile, role } = useAuth();
  const [showPreview, setShowPreview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [existingFile, setExistingFile] = useState<ExistingFile | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);

  const isFinanceOrAdmin = role === "finance" || role === "admin";

  useEffect(() => {
    loadExistingFile();
  }, [sheet.id]);

  const loadExistingFile = async () => {
    setLoadingExisting(true);
    const { data } = await supabase
      .from("payroll_transfer_files")
      .select("*")
      .eq("salary_sheet_id", sheet.id)
      .order("generated_at", { ascending: false })
      .limit(1);
    setExistingFile(data && data.length > 0 ? (data[0] as unknown as ExistingFile) : null);
    setLoadingExisting(false);
  };

  const { valid, errors } = useMemo(() => validateBankDetails(entries), [entries]);

  const totalAmount = useMemo(() => valid.reduce((s, e) => s + calculateNetPay(e), 0), [valid]);
  const excludedCount = useMemo(() => entries.filter((e) => calculateNetPay(e) <= 0).length, [entries]);

  const handleGenerate = async () => {
    if (errors.length > 0) {
      toast.error(`${errors.length} employees have invalid bank details. Fix them first.`);
      return;
    }

    setGenerating(true);
    try {
      const csv = generateCSV(valid, sheet.month, sheet.year);
      const blob = new Blob([csv], { type: "text/csv" });
      const monthShort = MONTH_SHORT[sheet.month].toLowerCase();
      const fileName = `salary_transfer_${monthShort}_${sheet.year}.csv`;
      const storagePath = `${sheet.id}/${fileName}`;

      // Upload to storage
      const { error: uploadErr } = await supabase.storage
        .from("payroll_transfers")
        .upload(storagePath, blob, { upsert: true, contentType: "text/csv" });

      if (uploadErr) {
        toast.error("Failed to upload transfer file");
        setGenerating(false);
        return;
      }

      // Get URL (signed URL for private bucket)
      const { data: urlData } = await supabase.storage
        .from("payroll_transfers")
        .createSignedUrl(storagePath, 60 * 60 * 24 * 30); // 30 day signed URL

      const fileUrl = urlData?.signedUrl || storagePath;

      // Log to payroll_transfer_files table
      await supabase.from("payroll_transfer_files").insert({
        salary_sheet_id: sheet.id,
        generated_by: user?.id,
        generated_by_name: profile?.name || "Unknown",
        file_url: fileUrl,
        employee_count: valid.length,
        total_amount: totalAmount,
      } as any);

      // Auto-create payment status records for each employee
      const paymentRows = valid.map((e) => ({
        salary_sheet_id: sheet.id,
        employee_id: e.employee_id,
        employee_name: e.employee_name,
        bank_account: (e.bank_account || "").replace(/\s/g, ""),
        ifsc_code: (e.ifsc_code || "").replace(/\s/g, "").toUpperCase(),
        amount: calculateNetPay(e),
        status: "pending",
      }));

      // Upsert: if re-generating, reset failed/pending statuses but keep paid ones
      for (const row of paymentRows) {
        const { data: existing } = await supabase
          .from("payroll_payment_status")
          .select("id, status")
          .eq("salary_sheet_id", row.salary_sheet_id)
          .eq("employee_id", row.employee_id)
          .limit(1);
        
        if (existing && existing.length > 0) {
          // Only update if not already paid
          if ((existing[0] as any).status !== "paid") {
            await supabase.from("payroll_payment_status")
              .update({ amount: row.amount, bank_account: row.bank_account, ifsc_code: row.ifsc_code, status: "pending", failure_reason: null, updated_at: new Date().toISOString() } as any)
              .eq("id", (existing[0] as any).id);
          }
        } else {
          await supabase.from("payroll_payment_status").insert(row as any);
        }
      }

      // Audit log
      if (user) {
        recordAuditLog(user.id, profile?.name || "", {
          action: "PAYROLL_TRANSFER_FILE_GENERATED",
          details: {
            salary_sheet_id: sheet.id,
            employee_count: valid.length,
            total_amount: totalAmount,
            month: sheet.month,
            year: sheet.year,
          },
        });
      }

      // Also trigger immediate download
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(downloadUrl);

      toast.success(`Bank transfer file generated for ${valid.length} employees`);
      await loadExistingFile();
      setShowPreview(false);
    } catch (e) {
      toast.error("Failed to generate transfer file");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadExisting = async () => {
    if (!existingFile?.file_url) return;

    if (user) {
      recordAuditLog(user.id, profile?.name || "", {
        action: "PAYROLL_TRANSFER_FILE_DOWNLOADED",
        details: {
          salary_sheet_id: sheet.id,
          employee_count: existingFile.employee_count,
          total_amount: existingFile.total_amount,
        },
      });
    }

    // Re-generate and download locally since signed URLs expire
    const csv = generateCSV(valid, sheet.month, sheet.year);
    const blob = new Blob([csv], { type: "text/csv" });
    const monthShort = MONTH_SHORT[sheet.month].toLowerCase();
    const fileName = `salary_transfer_${monthShort}_${sheet.year}.csv`;
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(downloadUrl);
    toast.success("Transfer file downloaded");
  };

  if (loadingExisting) return null;

  return (
    <>
      {/* Existing file info */}
      {existingFile && (
        <Card className="border-border/60">
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <span className="text-muted-foreground">Bank transfer file generated on</span>
                <span className="font-medium">
                  {new Date(existingFile.generated_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="text-muted-foreground">by {existingFile.generated_by_name}</span>
                <Badge variant="outline">{existingFile.employee_count} employees</Badge>
                <Badge variant="outline">₹{existingFile.total_amount.toLocaleString("en-IN")}</Badge>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleDownloadExisting}>
                  <Download className="h-4 w-4 mr-1" /> Download
                </Button>
                {isFinanceOrAdmin && (
                  <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Regenerate
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generate button (only if no existing file yet) */}
      {!existingFile && isFinanceOrAdmin && (
        <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
          <FileSpreadsheet className="h-4 w-4 mr-1" /> Generate Bank Transfer File
        </Button>
      )}

      {/* Preview dialog */}
      <AlertDialog open={showPreview} onOpenChange={setShowPreview}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" /> Bank Transfer File — {MONTH_SHORT[sheet.month]} {sheet.year}
            </AlertDialogTitle>
          </AlertDialogHeader>

          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="py-3 text-center">
                  <div className="text-2xl font-bold text-primary">{valid.length}</div>
                  <div className="text-xs text-muted-foreground">Employees Paid</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-3 text-center">
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">₹{totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                  <div className="text-xs text-muted-foreground">Total Amount</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-3 text-center">
                  <div className={`text-2xl font-bold ${errors.length > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>{errors.length}</div>
                  <div className="text-xs text-muted-foreground">Invalid Details</div>
                </CardContent>
              </Card>
            </div>

            {excludedCount > 0 && (
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
                ℹ️ {excludedCount} employee(s) excluded due to zero or negative net pay.
              </div>
            )}

            {/* Validation errors */}
            {errors.length > 0 && (
              <Card className="border-destructive/50">
                <CardHeader className="py-2 px-4">
                  <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" /> {errors.length} employee(s) have invalid bank details
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Issues</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {errors.map((err) => (
                        <TableRow key={err.employeeId}>
                          <TableCell className="font-medium">{err.employeeName}</TableCell>
                          <TableCell className="text-sm text-destructive">{err.errors.join("; ")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Preview of valid entries */}
            {valid.length > 0 && errors.length === 0 && (
              <Card>
                <CardHeader className="py-2 px-4">
                  <CardTitle className="text-sm">Transfer Preview</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <div className="overflow-x-auto max-h-48">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account No.</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>IFSC</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {valid.slice(0, 10).map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="font-mono text-xs">{e.bank_account}</TableCell>
                            <TableCell>{e.employee_name}</TableCell>
                            <TableCell className="font-mono text-xs">{e.ifsc_code}</TableCell>
                            <TableCell className="text-right font-medium">₹{calculateNetPay(e).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                          </TableRow>
                        ))}
                        {valid.length > 10 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground text-xs">
                              ...and {valid.length - 10} more
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleGenerate} disabled={errors.length > 0 || valid.length === 0 || generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
              {generating ? "Generating..." : "Generate & Download"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
