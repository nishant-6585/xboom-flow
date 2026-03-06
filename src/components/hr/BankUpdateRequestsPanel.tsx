import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, CheckCircle, XCircle, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { recordAuditLog } from "@/lib/auditLog";

interface BankUpdateRequest {
  id: string;
  employee_id: string;
  current_bank_account: string | null;
  current_ifsc: string | null;
  requested_bank_account: string;
  requested_ifsc: string;
  reason: string;
  status: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
  employee_name?: string;
}

export function BankUpdateRequestsPanel() {
  const { user, profile } = useAuth();
  const [requests, setRequests] = useState<BankUpdateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("employee_bank_update_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      // Enrich with employee names
      const empIds = [...new Set((data as any[]).map((r: any) => r.employee_id))];
      const { data: emps } = await supabase.from("employees").select("id, name").in("id", empIds);
      const nameMap = new Map((emps || []).map((e: any) => [e.id, e.name]));

      setRequests((data as any[]).map((r: any) => ({
        ...r,
        employee_name: nameMap.get(r.employee_id) || "Unknown",
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleAction = async (req: BankUpdateRequest, action: "approved" | "rejected") => {
    if (!user) return;
    setProcessingId(req.id);

    const { error } = await (supabase as any)
      .from("employee_bank_update_requests")
      .update({
        status: action,
        reviewed_by: user.id,
        reviewed_by_name: profile?.name || "Unknown",
        reviewed_at: new Date().toISOString(),
      } as any)
      .eq("id", req.id);

    if (error) {
      toast.error(`Failed to ${action} request`);
      setProcessingId(null);
      return;
    }

    // If approved, update employee bank details
    if (action === "approved") {
      await supabase
        .from("employees")
        .update({
          bank_account: req.requested_bank_account,
          ifsc_code: req.requested_ifsc,
        } as any)
        .eq("id", req.employee_id);
    }

    recordAuditLog(user.id, profile?.name || "", {
      action: action === "approved" ? "BANK_UPDATE_REQUEST_APPROVED" : "BANK_UPDATE_REQUEST_REJECTED",
      targetUserId: req.employee_id,
      details: {
        employee_name: req.employee_name,
        requested_bank_account: req.requested_bank_account,
        requested_ifsc: req.requested_ifsc,
      },
    });

    toast.success(`Request ${action}`);
    setProcessingId(null);
    fetchRequests();
  };

  const statusBadge = (status: string) => {
    if (status === "approved") return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Approved</Badge>;
    if (status === "rejected") return <Badge variant="destructive">Rejected</Badge>;
    return <Badge variant="outline">Pending</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Building2 className="h-5 w-5" /> Bank Update Requests
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No bank update requests.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Current Account</TableHead>
                  <TableHead>Requested Account</TableHead>
                  <TableHead>Current IFSC</TableHead>
                  <TableHead>Requested IFSC</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map(req => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">{req.employee_name}</TableCell>
                    <TableCell className="text-xs font-mono">{req.current_bank_account || "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{req.requested_bank_account}</TableCell>
                    <TableCell className="text-xs font-mono">{req.current_ifsc || "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{req.requested_ifsc}</TableCell>
                    <TableCell className="text-xs max-w-[150px] truncate">{req.reason}</TableCell>
                    <TableCell>{statusBadge(req.status)}</TableCell>
                    <TableCell className="text-xs">{format(new Date(req.created_at), "dd MMM yyyy")}</TableCell>
                    <TableCell>
                      {req.status === "pending" && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-emerald-600"
                            onClick={() => handleAction(req, "approved")}
                            disabled={processingId === req.id}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                            onClick={() => handleAction(req, "rejected")}
                            disabled={processingId === req.id}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      {req.status !== "pending" && (
                        <span className="text-xs text-muted-foreground">{req.reviewed_by_name}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
