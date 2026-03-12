import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { recordAuditLog } from "@/lib/auditLog";

export interface ResignationRequest {
  id: string;
  employee_id: string;
  user_id: string;
  proposed_lwd: string;
  reason: string;
  personal_email: string | null;
  status: string;
  hr_notes: string | null;
  approved_lwd: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  employee_name?: string;
  employee_department?: string;
}

export function useResignation() {
  const { user, profile, role } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<ResignationRequest[]>([]);
  const [myRequest, setMyRequest] = useState<ResignationRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const isHROrAdmin = role === "admin" || role === "hr";

  const fetchRequests = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Fetch resignation requests
    const { data, error } = await supabase
      .from("resignation_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching resignation requests:", error);
      setLoading(false);
      return;
    }

    const typed = (data || []) as ResignationRequest[];

    // Fetch employee names for HR view
    if (typed.length > 0) {
      const empIds = [...new Set(typed.map((r) => r.employee_id))];
      const { data: emps } = await supabase
        .from("employees")
        .select("id, name, department")
        .in("id", empIds);

      const empMap = new Map((emps || []).map((e: any) => [e.id, e]));
      typed.forEach((r) => {
        const emp = empMap.get(r.employee_id);
        if (emp) {
          r.employee_name = emp.name;
          r.employee_department = emp.department;
        }
      });
    }

    setRequests(typed);

    // Find current user's active request
    const mine = typed.find(
      (r) => r.user_id === user.id && (r.status === "pending" || r.status === "approved")
    );
    setMyRequest(mine || null);

    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const submitResignation = async (data: {
    proposed_lwd: string;
    reason: string;
    personal_email?: string;
  }) => {
    if (!user || !profile) return;

    // Get employee id
    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!emp) {
      toast({ title: "Error", description: "Employee record not found", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("resignation_requests").insert({
      employee_id: emp.id,
      user_id: user.id,
      proposed_lwd: data.proposed_lwd,
      reason: data.reason,
      personal_email: data.personal_email || null,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    await recordAuditLog(user.id, profile.name, {
      action: "RESIGNATION_SUBMITTED",
      details: { employee_id: emp.id, proposed_lwd: data.proposed_lwd },
    });

    toast({ title: "Resignation Submitted", description: "Your resignation request has been sent to HR for review." });
    await fetchRequests();
  };

  const withdrawResignation = async (requestId: string) => {
    const { error } = await supabase
      .from("resignation_requests")
      .update({ status: "withdrawn", updated_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("user_id", user?.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    await recordAuditLog(user.id, profile?.name || "", {
      action: "RESIGNATION_WITHDRAWN",
      details: { request_id: requestId },
    });
    toast({ title: "Resignation Withdrawn" });
    await fetchRequests();
  };

  const reviewResignation = async (
    requestId: string,
    action: "approved" | "rejected",
    data: { approved_lwd?: string; hr_notes?: string }
  ) => {
    if (!user || !profile) return;

    const { error } = await supabase
      .from("resignation_requests")
      .update({
        status: action,
        approved_lwd: data.approved_lwd || null,
        hr_notes: data.hr_notes || null,
        reviewed_by: user.id,
        reviewed_by_name: profile.name,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    await recordAuditLog(user.id, profile.name, {
      action: `RESIGNATION_${action.toUpperCase()}`,
      details: { request_id: requestId, approved_lwd: data.approved_lwd },
    });

    toast({
      title: action === "approved" ? "Resignation Approved" : "Resignation Rejected",
      description: action === "approved"
        ? "Employee exit date has been updated automatically."
        : "The resignation request has been rejected.",
    });
    await fetchRequests();
  };

  const addResignationByHR = async (data: {
    employee_id: string;
    resignation_date: string;
    proposed_lwd: string;
    reason: string;
    hr_notes?: string;
    status: string;
  }) => {
    if (!user || !profile) return;

    // Check for existing active resignation
    const { data: existing } = await supabase
      .from("resignation_requests")
      .select("id")
      .eq("employee_id", data.employee_id)
      .in("status", ["pending", "approved"])
      .maybeSingle();

    if (existing) {
      toast({ title: "Error", description: "This employee already has an active resignation record.", variant: "destructive" });
      return;
    }

    // Get employee's user_id (may be null)
    const { data: emp } = await supabase
      .from("employees")
      .select("id, user_id, name")
      .eq("id", data.employee_id)
      .maybeSingle();

    if (!emp) {
      toast({ title: "Error", description: "Employee not found.", variant: "destructive" });
      return;
    }

    const insertData: any = {
      employee_id: data.employee_id,
      user_id: emp.user_id || null,
      proposed_lwd: data.proposed_lwd,
      resignation_date: data.resignation_date,
      reason: data.reason,
      hr_notes: data.hr_notes || null,
      created_by_hr: user.id,
      created_by_hr_name: profile.name,
      status: data.status,
    };

    // If approved, set review fields and approved_lwd
    if (data.status === "approved") {
      insertData.approved_lwd = data.proposed_lwd;
      insertData.reviewed_by = user.id;
      insertData.reviewed_by_name = profile.name;
      insertData.reviewed_at = new Date().toISOString();
    }

    const { error } = await supabase.from("resignation_requests").insert(insertData);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    // If approved, update employee status to trigger offboarding
    if (data.status === "approved") {
      await supabase
        .from("employees")
        .update({
          employment_status: "resigned",
          exit_date: data.proposed_lwd,
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.employee_id);
    }

    await recordAuditLog(user.id, profile.name, {
      action: "RESIGNATION_ADDED_BY_HR",
      details: {
        employee_id: data.employee_id,
        employee_name: emp.name,
        resignation_date: data.resignation_date,
        last_working_day: data.proposed_lwd,
        status: data.status,
      },
    });

    toast({
      title: "Resignation Added",
      description: `Resignation record created for ${emp.name}.${data.status === "approved" ? " Employee status updated to Resigned." : ""}`,
    });
    await fetchRequests();
  };

  return {
    requests,
    myRequest,
    loading,
    isHROrAdmin,
    submitResignation,
    withdrawResignation,
    reviewResignation,
    addResignationByHR,
    refetch: fetchRequests,
  };
}
