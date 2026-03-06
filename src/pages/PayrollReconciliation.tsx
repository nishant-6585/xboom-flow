import { useState, useEffect, useMemo, useCallback } from "react";
import { Header } from "@/components/Header";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Users, IndianRupee, CheckCircle, Clock, XCircle, Upload, Download, Loader2, Lock, FileSpreadsheet, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { recordAuditLog } from "@/lib/auditLog";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_SHORT = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface PaymentRecord {
  id: string;
  salary_sheet_id: string;
  employee_id: string;
  employee_name: string;
  bank_account: string | null;
  ifsc_code: string | null;
  amount: number;
  status: string;
  failure_reason: string | null;
  bank_reference_number: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  updated_at: string;
  created_at: string;
}

interface SalarySheetOption {
  id: string;
  month: number;
  year: number;
  status: string;
}

export default function PayrollReconciliation() {
  const { user, profile, role } = useAuth();
  const isMobile = useIsMobile();
  const canAccess = role === "admin" || role === "finance" || role === "hr";
  const canEdit = role === "admin" || role === "finance";

  const [sheets, setSheets] = useState<SalarySheetOption[]>([]);
  const [selectedSheetId, setSelectedSheetId] = useState<string>("");
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);

  // Update dialog
  const [updateRecord, setUpdateRecord] = useState<PaymentRecord | null>(null);
  const [updateStatus, setUpdateStatus] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [failureReason, setFailureReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Bulk import
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<{ matched: number; unmatched: number } | null>(null);

  // Retry transfer
  const [retryConfirmOpen, setRetryConfirmOpen] = useState(false);
  const [generatingRetry, setGeneratingRetry] = useState(false);

  useEffect(() => {
    fetchLockedSheets();
  }, []);

  const fetchLockedSheets = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("salary_sheets")
      .select("id, month, year, status")
      .eq("status", "locked")
      .order("year", { ascending: false })
      .order("month", { ascending: false });
    const sheetsData = (data as unknown as SalarySheetOption[]) || [];
    setSheets(sheetsData);
    if (sheetsData.length > 0 && !selectedSheetId) {
      setSelectedSheetId(sheetsData[0].id);
    }
    setLoading(false);
  };

  const fetchRecords = useCallback(async (sheetId: string) => {
    if (!sheetId) return;
    setRecordsLoading(true);
    const { data } = await supabase
      .from("payroll_payment_status")
      .select("*")
      .eq("salary_sheet_id", sheetId)
      .order("employee_name", { ascending: true });
    setRecords((data as unknown as PaymentRecord[]) || []);
    setRecordsLoading(false);
  }, []);

  useEffect(() => {
    if (selectedSheetId) fetchRecords(selectedSheetId);
  }, [selectedSheetId, fetchRecords]);

  const selectedSheet = sheets.find((s) => s.id === selectedSheetId);

  // Summary stats
  const summary = useMemo(() => {
    const total = records.length;
    const totalAmount = records.reduce((s, r) => s + Number(r.amount), 0);
    const paid = records.filter((r) => r.status === "paid");
    const pending = records.filter((r) => r.status === "pending");
    const failed = records.filter((r) => r.status === "failed");
    return {
      total,
      totalAmount,
      paidAmount: paid.reduce((s, r) => s + Number(r.amount), 0),
      pendingAmount: pending.reduce((s, r) => s + Number(r.amount), 0),
      failedAmount: failed.reduce((s, r) => s + Number(r.amount), 0),
      paidCount: paid.length,
      pendingCount: pending.length,
      failedCount: failed.length,
    };
  }, [records]);

  const handleUpdateOpen = (record: PaymentRecord) => {
    setUpdateRecord(record);
    setUpdateStatus(record.status);
    setBankRef(record.bank_reference_number || "");
    setFailureReason(record.failure_reason || "");
  };

  const handleUpdateSave = async () => {
    if (!updateRecord || !user) return;
    setSaving(true);
    const oldStatus = updateRecord.status;
    const { error } = await supabase
      .from("payroll_payment_status")
      .update({
        status: updateStatus,
        bank_reference_number: bankRef || null,
        failure_reason: updateStatus === "failed" ? failureReason || null : null,
        updated_by: user.id,
        updated_by_name: profile?.name || "Unknown",
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", updateRecord.id);

    if (error) {
      toast.error("Failed to update payment status");
    } else {
      const action = updateStatus === "paid" ? "PAYROLL_PAYMENT_MARKED_PAID" : "PAYROLL_PAYMENT_MARKED_FAILED";
      recordAuditLog(user.id, profile?.name || "", {
        action,
        details: {
          employee_id: updateRecord.employee_id,
          salary_sheet_id: updateRecord.salary_sheet_id,
          old_status: oldStatus,
          new_status: updateStatus,
          amount: updateRecord.amount,
        },
      });
      toast.success(`Payment status updated to ${updateStatus}`);
      setUpdateRecord(null);
      fetchRecords(selectedSheetId);
    }
    setSaving(false);
  };

  const handleBulkImport = async () => {
    if (!importFile || !user) return;
    setImporting(true);
    try {
      const data = await importFile.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

      let matched = 0;
      let unmatched = 0;

      for (const row of rows) {
        const acctNum = String(row["Account Number"] || row["account_number"] || row["AccountNumber"] || "").trim();
        const amount = Number(row["Amount"] || row["amount"] || 0);
        const status = String(row["Status"] || row["status"] || "").toLowerCase().trim();
        const bankRef = String(row["Bank Reference"] || row["bank_reference"] || row["BankReference"] || row["Reference"] || "").trim();

        if (!acctNum || !amount) { unmatched++; continue; }

        const normalizedStatus = status === "paid" || status === "success" || status === "completed" ? "paid" : status === "failed" || status === "rejected" || status === "returned" ? "failed" : null;
        if (!normalizedStatus) { unmatched++; continue; }

        // Find matching record by account + amount in current sheet
        const match = records.find(
          (r) => (r.bank_account || "").replace(/\s/g, "") === acctNum && Math.abs(Number(r.amount) - amount) < 1
        );

        if (match) {
          await supabase
            .from("payroll_payment_status")
            .update({
              status: normalizedStatus,
              bank_reference_number: bankRef || null,
              updated_by: user.id,
              updated_by_name: profile?.name || "Unknown",
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", match.id);
          matched++;
        } else {
          unmatched++;
        }
      }

      recordAuditLog(user.id, profile?.name || "", {
        action: "PAYROLL_RECONCILIATION_FILE_IMPORTED",
        details: { salary_sheet_id: selectedSheetId, matched, unmatched, total_rows: rows.length },
      });

      setImportResults({ matched, unmatched });
      toast.success(`Reconciliation complete: ${matched} matched, ${unmatched} unmatched`);
      fetchRecords(selectedSheetId);
    } catch (e) {
      toast.error("Failed to process import file");
    } finally {
      setImporting(false);
    }
  };

  const handleGenerateRetryFile = async () => {
    if (!selectedSheet) return;
    setGeneratingRetry(true);

    const failedRecords = records.filter((r) => r.status === "failed");
    if (failedRecords.length === 0) {
      toast.error("No failed payments to retry");
      setGeneratingRetry(false);
      setRetryConfirmOpen(false);
      return;
    }

    const header = "Account Number,Account Holder Name,IFSC Code,Amount,Payment Reference,Remarks";
    const rows = failedRecords.map((r) => {
      const ref = `Salary_Retry_${MONTH_SHORT[selectedSheet.month]}_${selectedSheet.year}`;
      const name = r.employee_name.replace(/,/g, " ");
      return `${r.bank_account || ""},${name},${r.ifsc_code || ""},${Number(r.amount).toFixed(2)},${ref},Salary Retry Payment`;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const monthShort = MONTH_SHORT[selectedSheet.month].toLowerCase();
    const fileName = `salary_retry_${monthShort}_${selectedSheet.year}.csv`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    if (user) {
      recordAuditLog(user.id, profile?.name || "", {
        action: "PAYROLL_TRANSFER_FILE_GENERATED",
        details: { salary_sheet_id: selectedSheetId, type: "retry", employee_count: failedRecords.length, total_amount: failedRecords.reduce((s, r) => s + Number(r.amount), 0) },
      });
    }

    toast.success(`Retry file generated for ${failedRecords.length} employees`);
    setRetryConfirmOpen(false);
    setGeneratingRetry(false);
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "paid": return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Paid</Badge>;
      case "failed": return <Badge variant="destructive">Failed</Badge>;
      default: return <Badge variant="secondary">Pending</Badge>;
    }
  };

  if (!canAccess) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center py-20">
            <Lock className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground text-center max-w-md">Payroll Reconciliation is only accessible to Admin, Finance, and HR.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 pb-24 md:pb-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-primary/70">
                <IndianRupee className="h-5 w-5 text-primary-foreground" />
              </div>
              Payroll Reconciliation
            </h1>
            <p className="text-muted-foreground mt-1">Track salary payment status after bank transfer</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedSheetId} onValueChange={setSelectedSheetId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select salary sheet" />
              </SelectTrigger>
              <SelectContent>
                {sheets.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{MONTH_NAMES[s.month]} {s.year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : sheets.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">No locked salary sheets found. Lock a salary sheet first to use reconciliation.</div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card>
                <CardContent className="py-4 text-center">
                  <Users className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                  <div className="text-2xl font-bold">{summary.total}</div>
                  <div className="text-xs text-muted-foreground">Total Employees</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <IndianRupee className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                  <div className="text-xl font-bold">₹{summary.totalAmount.toLocaleString("en-IN")}</div>
                  <div className="text-xs text-muted-foreground">Total Payroll</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <CheckCircle className="h-5 w-5 mx-auto text-emerald-500 mb-1" />
                  <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">₹{summary.paidAmount.toLocaleString("en-IN")}</div>
                  <div className="text-xs text-muted-foreground">Paid ({summary.paidCount})</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <Clock className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                  <div className="text-xl font-bold">₹{summary.pendingAmount.toLocaleString("en-IN")}</div>
                  <div className="text-xs text-muted-foreground">Pending ({summary.pendingCount})</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 text-center">
                  <XCircle className="h-5 w-5 mx-auto text-destructive mb-1" />
                  <div className="text-xl font-bold text-destructive">₹{summary.failedAmount.toLocaleString("en-IN")}</div>
                  <div className="text-xs text-muted-foreground">Failed ({summary.failedCount})</div>
                </CardContent>
              </Card>
            </div>

            {/* Action buttons */}
            {canEdit && records.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="h-4 w-4 mr-1" /> Import Bank Statement
                </Button>
                {summary.failedCount > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setRetryConfirmOpen(true)}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Generate Retry Transfer File ({summary.failedCount})
                  </Button>
                )}
              </div>
            )}

            {/* Records Table */}
            {recordsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : records.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No payment records found. Generate a bank transfer file first.</div>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Bank Account</TableHead>
                          <TableHead>IFSC</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Bank Ref.</TableHead>
                          <TableHead>Failure Reason</TableHead>
                          {canEdit && <TableHead className="w-24">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {records.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.employee_name}</TableCell>
                            <TableCell className="font-mono text-xs">{r.bank_account || "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{r.ifsc_code || "—"}</TableCell>
                            <TableCell className="text-right font-medium">₹{Number(r.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell>{statusBadge(r.status)}</TableCell>
                            <TableCell className="text-xs">{r.bank_reference_number || "—"}</TableCell>
                            <TableCell className="text-xs text-destructive">{r.failure_reason || "—"}</TableCell>
                            {canEdit && (
                              <TableCell>
                                <Button variant="ghost" size="sm" onClick={() => handleUpdateOpen(r)}>Update</Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>

      {/* Update Status Dialog */}
      <Dialog open={!!updateRecord} onOpenChange={(open) => { if (!open) setUpdateRecord(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Payment — {updateRecord?.employee_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Amount</Label>
              <div className="text-lg font-bold">₹{Number(updateRecord?.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
            </div>
            <div>
              <Label>Payment Status</Label>
              <Select value={updateStatus} onValueChange={setUpdateStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Bank Reference Number</Label>
              <Input value={bankRef} onChange={(e) => setBankRef(e.target.value)} placeholder="e.g. NEFT123456789" />
            </div>
            {updateStatus === "failed" && (
              <div>
                <Label>Failure Reason</Label>
                <Textarea value={failureReason} onChange={(e) => setFailureReason(e.target.value)} placeholder="e.g. Invalid account number" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateRecord(null)}>Cancel</Button>
            <Button onClick={handleUpdateSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Bank Statement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a CSV/Excel file with columns: <strong>Account Number</strong>, <strong>Amount</strong>, <strong>Status</strong> (Paid/Failed), <strong>Bank Reference</strong>.
              The system will auto-match employees by account number and amount.
            </p>
            <div>
              <Label>Bank Statement File</Label>
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => { setImportFile(e.target.files?.[0] || null); setImportResults(null); }}
              />
            </div>
            {importResults && (
              <div className="p-3 rounded-md bg-muted text-sm">
                <p>✅ <strong>{importResults.matched}</strong> payments matched and updated</p>
                {importResults.unmatched > 0 && <p>⚠️ <strong>{importResults.unmatched}</strong> rows could not be matched</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportDialogOpen(false); setImportFile(null); setImportResults(null); }}>Close</Button>
            <Button onClick={handleBulkImport} disabled={!importFile || importing}>
              {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
              {importing ? "Importing..." : "Import & Reconcile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retry Confirm Dialog */}
      <AlertDialog open={retryConfirmOpen} onOpenChange={setRetryConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate Retry Transfer File?</AlertDialogTitle>
            <AlertDialogDescription>
              This will generate a new CSV file containing only the {summary.failedCount} failed payment(s)
              totalling ₹{summary.failedAmount.toLocaleString("en-IN")}. You can upload this to your bank portal to retry.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleGenerateRetryFile} disabled={generatingRetry}>
              {generatingRetry ? "Generating..." : "Generate & Download"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isMobile && <MobileBottomNav />}
    </div>
  );
}
