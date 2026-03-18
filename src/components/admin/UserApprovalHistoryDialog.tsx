import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, CheckCircle, UserPlus, Shield, KeyRound, Trash2, UserCog, MessageSquare } from "lucide-react";
import { format } from "date-fns";

interface ApprovalHistoryItem {
  id: string;
  action: string;
  performed_at: string;
  user_id: string;
  user_name: string | null;
  target_user_id: string | null;
  details: Record<string, any> | null;
}

interface InvitationRecord {
  id: string;
  email: string;
  name: string;
  role: string;
  department: string | null;
  status: string;
  invited_at: string;
  accepted_at: string | null;
  invited_by: string | null;
  invited_by_name?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  userEmail: string;
}

const ACTION_ICONS: Record<string, typeof CheckCircle> = {
  invitation_approved: CheckCircle,
  invitation_cancelled: Trash2,
  user_approved: CheckCircle,
  registration_denied: Trash2,
  user_invited: UserPlus,
  role_changed: Shield,
  password_reset: KeyRound,
  user_deleted: Trash2,
  manager_changed: UserCog,
  department_changed: UserCog,
};

const ACTION_LABELS: Record<string, string> = {
  invitation_approved: "Invitation Approved",
  invitation_cancelled: "Invitation Cancelled",
  user_approved: "User Approved",
  registration_denied: "Registration Denied",
  user_invited: "User Invited",
  role_changed: "Role Changed",
  password_reset: "Password Reset",
  user_deleted: "User Deleted",
  manager_changed: "Manager Changed",
  department_changed: "Department Changed",
  login: "Login",
  mfa_enabled: "MFA Enabled",
};

function getActionColor(action: string): string {
  if (action.includes("approved") || action.includes("login")) return "text-green-400";
  if (action.includes("deleted")) return "text-destructive";
  if (action.includes("changed") || action.includes("reset")) return "text-yellow-400";
  return "text-primary";
}

export function UserApprovalHistoryDialog({ open, onOpenChange, userId, userName, userEmail }: Props) {
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<ApprovalHistoryItem[]>([]);
  const [invitation, setInvitation] = useState<InvitationRecord | null>(null);

  useEffect(() => {
    if (!open) return;
    fetchHistory();
  }, [open, userId]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      // Fetch audit logs for this user (both as actor and target)
      const { data: logs } = await supabase
        .from("security_audit_log")
        .select("id, action, performed_at, user_name, details")
        .or(`target_user_id.eq.${userId},user_id.eq.${userId}`)
        .order("performed_at", { ascending: false })
        .limit(50);

      setAuditLogs((logs as unknown as ApprovalHistoryItem[]) || []);

      // Fetch invitation record
      const { data: inv } = await supabase
        .from("user_invitations")
        .select("*")
        .eq("email", userEmail)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (inv) {
        let inviterName: string | undefined;
        if (inv.invited_by) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("name")
            .eq("user_id", inv.invited_by)
            .maybeSingle();
          inviterName = profile?.name || undefined;
        }
        setInvitation({ ...inv, invited_by_name: inviterName } as InvitationRecord);
      } else {
        setInvitation(null);
      }
    } catch (err) {
      console.error("Failed to fetch approval history:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDetails = (details: Record<string, any> | null): { info: string | null; comment: string | null } => {
    if (!details) return { info: null, comment: null };
    const parts: string[] = [];
    if (details.role) parts.push(`Role: ${details.role}`);
    if (details.new_role) parts.push(`New Role: ${details.new_role}`);
    if (details.old_role) parts.push(`Old Role: ${details.old_role}`);
    if (details.department) parts.push(`Department: ${details.department}`);
    if (details.new_department) parts.push(`New Dept: ${details.new_department}`);
    if (details.old_department) parts.push(`Old Dept: ${details.old_department}`);
    if (details.manager_name) parts.push(`Manager: ${details.manager_name}`);
    if (details.new_manager_name) parts.push(`New Manager: ${details.new_manager_name}`);
    if (details.approved_by_name) parts.push(`Approved by: ${details.approved_by_name}`);
    if (details.admin_name) parts.push(`By: ${details.admin_name}`);
    if (details.target_name) parts.push(`User: ${details.target_name}`);
    if (details.email) parts.push(`Email: ${details.email}`);
    return {
      info: parts.length > 0 ? parts.join(" • ") : null,
      comment: details.comment || null,
    };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Approval History — {userName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Invitation Details */}
            {invitation && (
              <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-primary" />
                  Invitation Record
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Status: </span>
                    <Badge variant={invitation.status === "accepted" ? "default" : "secondary"} className="text-xs">
                      {invitation.status}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Role: </span>
                    <span className="capitalize">{invitation.role?.replace(/_/g, " ")}</span>
                  </div>
                  {invitation.department && (
                    <div>
                      <span className="text-muted-foreground">Department: </span>
                      <span>{invitation.department}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Invited: </span>
                    <span>{format(new Date(invitation.invited_at), "dd MMM yyyy, HH:mm")}</span>
                  </div>
                  {invitation.invited_by_name && (
                    <div>
                      <span className="text-muted-foreground">Invited by: </span>
                      <span>{invitation.invited_by_name}</span>
                    </div>
                  )}
                  {invitation.accepted_at && (
                    <div>
                      <span className="text-muted-foreground">Accepted: </span>
                      <span>{format(new Date(invitation.accepted_at), "dd MMM yyyy, HH:mm")}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Audit Timeline */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Activity Timeline</h4>
              {auditLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No audit history found</p>
              ) : (
                <div className="space-y-1">
                  {auditLogs.map((log) => {
                    const IconComp = ACTION_ICONS[log.action] || Clock;
                    const { info, comment } = formatDetails(log.details);
                    return (
                      <div key={log.id} className="flex items-start gap-3 p-2.5 rounded-md hover:bg-secondary/50 transition-colors">
                        <IconComp className={`w-4 h-4 mt-0.5 shrink-0 ${getActionColor(log.action)}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {ACTION_LABELS[log.action] || log.action.replace(/_/g, " ")}
                          </p>
                          {info && (
                            <p className="text-xs text-muted-foreground mt-0.5">{info}</p>
                          )}
                          {comment && (
                            <div className="flex items-start gap-1.5 mt-1 p-2 rounded bg-secondary/60 border border-border">
                              <MessageSquare className="w-3 h-3 mt-0.5 shrink-0 text-primary" />
                              <p className="text-xs text-foreground">{comment}</p>
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(log.performed_at), "dd MMM yyyy, HH:mm")}
                            {log.user_name && ` • by ${log.user_name}`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
