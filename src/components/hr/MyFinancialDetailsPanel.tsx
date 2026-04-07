import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Wallet, History, Building2, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { recordAuditLog } from "@/lib/auditLog";

interface EmployeeFinancial {
  id: string;
  name: string;
  bank_account: string | null;
  ifsc_code: string | null;
  monthly_salary: number | null;
}

interface SalaryHistoryEntry {
  id: string;
  effective_from: string;
  salary: number;
  created_by_name: string | null;
}

interface BankRequest {
  id: string;
  status: string;
  requested_bank_account: string;
  requested_ifsc: string;
  created_at: string;
}

export function MyFinancialDetailsPanel() {
  const { user } = useAuth();
  const [employee, setEmployee] = useState<EmployeeFinancial | null>(null);
  const [history, setHistory] = useState<SalaryHistoryEntry[]>([]);
  const [pendingRequest, setPendingRequest] = useState<BankRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newBank, setNewBank] = useState("");
  const [newIfsc, setNewIfsc] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: emp } = await supabase
      .from("employees")
      .select("id, name, bank_account, ifsc_code, monthly_salary")
      .eq("user_id", user.id)
      .single();

    if (!emp) { setLoading(false); return; }
    const empData = emp as unknown as EmployeeFinancial;
    setEmployee(empData);

    const [{ data: hist }, { data: reqs }] = await Promise.all([
      supabase.from("salary_history").select("id, effective_from, salary, created_by_name").eq("employee_id", empData.id).order("effective_from", { ascending: false }),
      (supabase as any).from("employee_bank_update_requests").select("*").eq("employee_id", empData.id).eq("status", "pending").limit(1),
    ]);

    setHistory((hist as unknown as SalaryHistoryEntry[]) || []);
    setPendingRequest((reqs as unknown as BankRequest[])?.[0] || null);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const validateBank = (val: string) => /^\d{9,18}$/.test(val);
  const validateIfsc = (val: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(val.toUpperCase());

  const handleSubmitRequest = async () => {
    if (!user || !employee) return;
    if (!newBank || !validateBank(newBank)) { toast.error("Account number must be 9-18 digits"); return; }
    if (!newIfsc || !validateIfsc(newIfsc)) { toast.error("Invalid IFSC format"); return; }
    if (!reason.trim()) { toast.error("Please provide a reason"); return; }

    setSubmitting(true);
    const { error } = await (supabase as any).from("employee_bank_update_requests").insert({
      employee_id: employee.id,
      current_bank_account: employee.bank_account,
      current_ifsc: employee.ifsc_code,
      requested_bank_account: newBank,
      requested_ifsc: newIfsc.toUpperCase(),
      reason: reason.trim(),
    } as any);

    if (error) {
      toast.error("Failed to submit request");
    } else {
      recordAuditLog(user.id, "", {
        action: "BANK_UPDATE_REQUEST_CREATED",
        details: { employee_id: employee.id },
      });
      toast.success("Bank update request submitted for HR approval");
      setDialogOpen(false);
      setNewBank(""); setNewIfsc(""); setReason("");
      fetchData();
    }
    setSubmitting(false);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!employee) return <div className="text-center py-12 text-muted-foreground">Employee record not found.</div>;

  return (
    <div className="space-y-6">
      {/* Bank Details */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Bank Details
          </CardTitle>
          <Button
            variant="outline" size="sm"
            onClick={() => setDialogOpen(true)}
            disabled={!!pendingRequest}
          >
            <PenLine className="h-4 w-4 mr-1" /> Request Update
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground text-xs">Bank Account Number</Label>
              <p className="font-mono font-medium">{employee.bank_account || "Not set"}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">IFSC Code</Label>
              <p className="font-mono font-medium">{employee.ifsc_code || "Not set"}</p>
            </div>
          </div>
          {pendingRequest && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                You have a pending bank update request (submitted {format(new Date(pendingRequest.created_at), "dd MMM yyyy")}). Please wait for HR approval.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Current Salary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="h-5 w-5" /> Current Salary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground text-xs">Monthly Salary</Label>
              <p className="text-xl font-bold">₹{(employee.monthly_salary || 0).toLocaleString("en-IN")}</p>
            </div>
            {history.length > 0 && (
              <div>
                <Label className="text-muted-foreground text-xs">Effective Since</Label>
                <p className="font-medium">{format(new Date(history[0].effective_from), "MMM yyyy")}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Salary History */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5" /> Salary History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Effective Date</TableHead>
                  <TableHead>Salary (₹)</TableHead>
                  <TableHead>Updated By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h, idx) => (
                  <TableRow key={h.id} className={idx === 0 ? "bg-primary/5" : ""}>
                    <TableCell className="font-medium">
                      {format(new Date(h.effective_from), "dd MMM yyyy")}
                      {idx === 0 && <Badge variant="outline" className="ml-2 text-xs">Current</Badge>}
                    </TableCell>
                    <TableCell>₹{Number(h.salary).toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-xs">{h.created_by_name || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Bank Update Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Bank Detail Update</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-bank">New Bank Account Number</Label>
              <Input id="new-bank" value={newBank} onChange={e => { if (/^\d*$/.test(e.target.value)) setNewBank(e.target.value); }} maxLength={18} placeholder="Enter account number" />
              {newBank && !validateBank(newBank) && <p className="text-xs text-destructive mt-1">Must be 9-18 digits</p>}
            </div>
            <div>
              <Label htmlFor="new-ifsc">New IFSC Code</Label>
              <Input id="new-ifsc" value={newIfsc} onChange={e => setNewIfsc(e.target.value.toUpperCase())} maxLength={11} placeholder="e.g. SBIN0001234" />
              {newIfsc && !validateIfsc(newIfsc) && <p className="text-xs text-destructive mt-1">Format: 4 letters + 0 + 6 chars</p>}
            </div>
            <div>
              <Label htmlFor="bank-reason">Reason for Change</Label>
              <Textarea id="bank-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Why are you updating bank details?" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitRequest} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
