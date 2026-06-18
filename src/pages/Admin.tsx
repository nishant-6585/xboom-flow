import { useState, useEffect, useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { useReAuth } from "@/hooks/useReAuth";
import ReAuthDialog from "@/components/admin/ReAuthDialog";
import { recordAuditLog } from "@/lib/auditLog";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useEnquiries } from "@/hooks/useEnquiries";
import { useOrders } from "@/hooks/useOrders";
import { EnquiryAnalytics, ValueFilterType } from "@/components/EnquiryAnalytics";
import { PaymentRemindersCard } from "@/components/PaymentRemindersCard";
import { PendingPaymentApprovals } from "@/components/PendingPaymentApprovals";
import { InviteUserDialog } from "@/components/admin/InviteUserDialog";
import { NoticesPanel } from "@/components/notices/NoticesPanel";
import { Check, X, Users, ShieldCheck, ShieldOff, Clock, Loader2, BarChart3, CreditCard, Receipt, KeyRound, Trash2, UserCog, MessageSquare, ClipboardList, Mail, Bell, Activity, Building2, CalendarClock, Shield, CalendarDays, History, Briefcase, FileQuestion, Package } from "lucide-react";
import { UserApprovalHistoryDialog } from "@/components/admin/UserApprovalHistoryDialog";
import { ActionWithCommentDialog } from "@/components/admin/ActionWithCommentDialog";
import UserActivityTracker from "@/components/admin/UserActivityTracker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { SlackSettingsPanel } from "@/components/admin/SlackSettingsPanel";
import { WooCommerceSyncPanel } from "@/components/admin/WooCommerceSyncPanel";
import { LeadSyncHealthPanel } from "@/components/admin/LeadSyncHealthPanel";
import { MyOperatorSettingsPanel } from "@/components/admin/MyOperatorSettingsPanel";
import { ExotelSettingsPanel } from "@/components/admin/ExotelSettingsPanel";
import AgentMappingPanel from "@/components/admin/AgentMappingPanel";

import { FormPermissionsPanel } from "@/components/admin/FormPermissionsPanel";
import { AdminSignatureSettings } from "@/components/admin/AdminSignatureSettings";
import OrgSettingsPanel from "@/components/admin/OrgSettingsPanel";
import { AttendancePolicySettings } from "@/components/admin/AttendancePolicySettings";
import { HolidayManagementPanel } from "@/components/admin/HolidayManagementPanel";
import AdminEmployeeActivity from "@/components/admin/AdminEmployeeActivity";

interface PendingUser {
  id: string;
  user_id: string;
  name: string;
  email: string;
  is_approved: boolean;
  created_at: string;
  role: string;
}

interface ApprovedUser {
  id: string;
  user_id: string;
  name: string;
  email: string;
  created_at: string;
  role: string;
  roles: string[];
  department: string;
  reporting_manager_id: string | null;
  reporting_manager_name?: string;
}

interface UserInvitation {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  invited_at: string;
}

const Admin = () => {
  const { user, profile, role, roles, isApproved } = useAuth();
  const isFinanceOnly = !roles.includes("admin") && roles.includes("finance");
  const { toast } = useToast();
  const { reAuthState, requireReAuth, setReAuthOpen } = useReAuth();
  const { enquiries } = useEnquiries();
  const { orders } = useOrders();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<ApprovedUser[]>([]);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [invitationsLoading, setInvitationsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [mfaResetLoading, setMfaResetLoading] = useState<string | null>(null);
  const [roleChangeLoading, setRoleChangeLoading] = useState<string | null>(null);
  const [managerChangeLoading, setManagerChangeLoading] = useState<string | null>(null);
  const [deptChangeLoading, setDeptChangeLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("analytics");
  const [orgRoles, setOrgRoles] = useState<{ id: string; name: string; label: string; is_active: boolean }[]>([]);
  const [orgDepartments, setOrgDepartments] = useState<{ id: string; name: string; is_active: boolean }[]>([]);
  const [historyUser, setHistoryUser] = useState<{ userId: string; name: string; email: string } | null>(null);
  const fetchOrgData = async () => {
    const [rolesRes, deptsRes] = await Promise.all([
      supabase.from("org_roles").select("id, name, label, is_active").eq("is_active", true).order("name"),
      supabase.from("org_departments").select("id, name, is_active").eq("is_active", true).order("name"),
    ]);
    if (rolesRes.data) setOrgRoles(rolesRes.data);
    if (deptsRes.data) setOrgDepartments(deptsRes.data);
  };

  // Set default tab for finance-only users
  useEffect(() => {
    if (isFinanceOnly) {
      setActiveTab("approvals");
    }
  }, [isFinanceOnly]);

  // Sync activeTab with ?tab= URL param so deep-links from AdminTabsNav work
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && t !== activeTab) setActiveTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTabChange = (v: string) => {
    setActiveTab(v);
    const next = new URLSearchParams(searchParams);
    next.set("tab", v);
    setSearchParams(next, { replace: true });
  };

  // Move useEffect before any conditional returns to follow React Hooks rules
  useEffect(() => {
    if (role === "admin" && isApproved) {
      fetchPendingUsers();
      fetchApprovedUsers();
      fetchInvitations();
      fetchOrgData();
    }
  }, [role, isApproved]);

  const handleValueFilterClick = (filterType: ValueFilterType, specificDate?: Date) => {
    // Navigate to main page with filter params
    const params = new URLSearchParams();
    params.set("valueFilter", filterType);
    if (specificDate) {
      params.set("valueDate", specificDate.toISOString());
    }
    navigate(`/?${params.toString()}`);
  };

   // Redirect if not admin/finance or not approved
  const hasAdminAccess = role === "admin" || roles.includes("finance");
  if (!hasAdminAccess || !isApproved) {
    return <Navigate to="/" replace />;
  }

  const fetchPendingUsers = async () => {
    try {
      // Use secure RPC function instead of direct view access
      const { data, error } = await supabase.rpc("get_pending_registrations");

      if (error) throw error;
      setPendingUsers(data || []);
    } catch (error) {
      console.error("Error fetching pending users:", error);
      toast({
        title: "Error",
        description: "Failed to fetch pending registrations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchInvitations = async () => {
    try {
      setInvitationsLoading(true);
      const { data, error } = await supabase
        .from("user_invitations")
        .select("*")
        .eq("status", "pending")
        .order("invited_at", { ascending: false });

      if (error) throw error;
      setInvitations(data || []);
    } catch (error) {
      console.error("Error fetching invitations:", error);
    } finally {
      setInvitationsLoading(false);
    }
  };

  const handleApproveInvitation = async (invitationId: string, name: string, email: string, comment: string) => {
    setActionLoading(invitationId);
    try {
      const { data, error } = await supabase.functions.invoke("approve-invitation", {
        body: { invitation_id: invitationId },
      });

      if (error) {
        // Try to extract the actual error message from the response
        const errorMsg = data?.error || error.message || "Failed to approve invitation";
        throw new Error(errorMsg);
      }
      if (data?.error) throw new Error(data.error);

      // Log audit with comment
      if (user) {
        await recordAuditLog(user.id, profile?.name || "Admin", {
          action: "invitation_approved",
          targetUserId: data?.user_id || undefined,
          details: { target_name: name, email, comment, role: data?.role },
        });
      }

      toast({
        title: "Invitation Approved",
        description: data?.is_existing_user
          ? `${name} (${email}) has been approved`
          : `${name} (${email}) has been created and approved. They can use "Forgot Password" to set their password.`,
      });

      fetchInvitations();
      fetchApprovedUsers();
    } catch (error: any) {
      console.error("Error approving invitation:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to approve invitation",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelInvitation = async (invitationId: string, email: string, comment: string) => {
    setActionLoading(invitationId);
    try {
      const { error } = await supabase
        .from("user_invitations")
        .update({ status: "cancelled" })
        .eq("id", invitationId);

      if (error) throw error;

      // Log audit with comment
      if (user) {
        await recordAuditLog(user.id, profile?.name || "Admin", {
          action: "invitation_cancelled",
          details: { email, comment },
        });
      }

      toast({
        title: "Invitation Cancelled",
        description: `Invitation for ${email} has been cancelled`,
      });

      fetchInvitations();
    } catch (error) {
      console.error("Error cancelling invitation:", error);
      toast({
        title: "Error",
        description: "Failed to cancel invitation",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const fetchApprovedUsers = async () => {
    try {
      setUsersLoading(true);
      // Fetch approved users with their roles and reporting manager
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, user_id, name, email, created_at, reporting_manager_id")
        .eq("is_approved", true);

      if (profilesError) throw profilesError;

      // Fetch roles for these users
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Fetch departments from employees table
      const { data: employees } = await supabase
        .from("employees")
        .select("user_id, department")
        .eq("is_active", true);

      // Create a name lookup map
      const nameMap = new Map<string, string>();
      (profiles || []).forEach((p) => nameMap.set(p.user_id, p.name));

      // Create department lookup map
      const deptMap = new Map<string, string>();
      (employees || []).forEach((e: any) => {
        if (e.user_id) deptMap.set(e.user_id, e.department || "General");
      });

      // Combine profiles with roles (collect ALL roles) and manager names
      const usersWithRoles = (profiles || []).map((profile) => {
        const userRoles = roles?.filter((r) => r.user_id === profile.user_id) || [];
        const roleStrings = userRoles.map(r => r.role as string);
        return {
          ...profile,
          role: roleStrings.length > 0 ? roleStrings.join(", ") : "unknown",
          roles: roleStrings.length > 0 ? roleStrings : ["unknown"],
          department: deptMap.get(profile.user_id) || "General",
          reporting_manager_name: profile.reporting_manager_id 
            ? nameMap.get(profile.reporting_manager_id) || null 
            : null,
        };
      });

      setApprovedUsers(usersWithRoles.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    } catch (error) {
      console.error("Error fetching approved users:", error);
    } finally {
      setUsersLoading(false);
    }
  };

  const handleApprove = async (userId: string, userName: string, comment: string) => {
    setActionLoading(userId);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_approved: true })
        .eq("user_id", userId);

      if (error) throw error;

      if (user) {
        await recordAuditLog(user.id, profile?.name || "Admin", {
          action: "user_approved",
          targetUserId: userId,
          details: { target_name: userName, comment },
        });
      }

      toast({
        title: "User Approved",
        description: `${userName} can now access the system`,
      });

      fetchPendingUsers();
    } catch (error) {
      console.error("Error approving user:", error);
      toast({
        title: "Error",
        description: "Failed to approve user",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeny = async (userId: string, userName: string, comment: string) => {
    setActionLoading(userId);
    try {
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("user_id", userId);

      if (error) throw error;

      if (user) {
        await recordAuditLog(user.id, profile?.name || "Admin", {
          action: "registration_denied",
          targetUserId: userId,
          details: { target_name: userName, comment },
        });
      }

      toast({
        title: "Registration Denied",
        description: `${userName}'s registration has been denied`,
      });

      fetchPendingUsers();
    } catch (error) {
      console.error("Error denying user:", error);
      toast({
        title: "Error",
        description: "Failed to deny registration",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetPassword = async (email: string, userName: string) => {
    setResetLoading(email);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });

      if (error) throw error;

      toast({
        title: "Password Reset Email Sent",
        description: `A password reset link has been sent to ${email}`,
      });
    } catch (error: any) {
      console.error("Error sending password reset:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send password reset email",
        variant: "destructive",
      });
    } finally {
      setResetLoading(null);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    requireReAuth({
      title: "Delete User",
      description: `You are about to permanently delete ${userName}. This action cannot be undone.`,
      onConfirmed: async () => {
        setDeleteLoading(userId);
        try {
          const { error: roleError } = await supabase
            .from("user_roles")
            .delete()
            .eq("user_id", userId);
          if (roleError) throw roleError;

          const { error: profileError } = await supabase
            .from("profiles")
            .delete()
            .eq("user_id", userId);
          if (profileError) throw profileError;

          // Audit log
          if (user && profile) {
            recordAuditLog(user.id, profile.name, {
              action: "user_deleted",
              targetUserId: userId,
              details: { deleted_user: userName },
            });
          }

          toast({ title: "User Deleted", description: `${userName} has been removed from the system` });
          fetchApprovedUsers();
        } catch (error) {
          console.error("Error deleting user:", error);
          toast({ title: "Error", description: "Failed to delete user", variant: "destructive" });
        } finally {
          setDeleteLoading(null);
        }
      },
    });
  };

  const handleResetMFA = async (userId: string, userName: string) => {
    requireReAuth({
      title: "Reset MFA",
      description: `You are about to remove all MFA factors for ${userName}. They will need to enroll a new authenticator on next login. Continue?`,
      onConfirmed: async () => {
        setMfaResetLoading(userId);
        try {
          const { data, error } = await supabase.functions.invoke("admin-reset-mfa", {
            body: { target_user_id: userId },
          });
          if (error) throw error;
          if ((data as any)?.error) throw new Error((data as any).error);

          if (user && profile) {
            recordAuditLog(user.id, profile.name, {
              action: "admin_reset_mfa",
              targetUserId: userId,
              details: { user_name: userName, factors_removed: (data as any)?.factors_removed ?? 0 },
            });
          }

          toast({
            title: "MFA Reset",
            description: `Removed ${(data as any)?.factors_removed ?? 0} MFA factor(s) for ${userName}. They will be required to re-enroll on next login.`,
          });
        } catch (error: any) {
          console.error("Error resetting MFA:", error);
          toast({
            title: "Error",
            description: error.message || "Failed to reset MFA",
            variant: "destructive",
          });
        } finally {
          setMfaResetLoading(null);
        }
      },
    });
  };

  const handleToggleRole = async (userId: string, role: string, currentRoles: string[], userName: string) => {
    requireReAuth({
      title: "Change User Role",
      description: `You are about to modify roles for ${userName}. Confirm your identity to proceed.`,
      onConfirmed: async () => {
        setRoleChangeLoading(userId);
        try {
          const hasRole = currentRoles.includes(role);
          
          if (hasRole) {
            if (currentRoles.length <= 1) {
              toast({ title: "Cannot Remove", description: "User must have at least one role.", variant: "destructive" });
              setRoleChangeLoading(null);
              return;
            }
            const { error } = await supabase
              .from("user_roles")
              .delete()
              .eq("user_id", userId)
              .eq("role", role as any);
            if (error) throw error;

            if (user && profile) {
              recordAuditLog(user.id, profile.name, {
                action: "role_removed",
                targetUserId: userId,
                details: { role, user_name: userName },
              });
            }

            toast({ title: "Role Removed", description: `Removed ${getRoleLabel(role)} from ${userName}` });
          } else {
            const { error } = await supabase
              .from("user_roles")
              .insert({ user_id: userId, role: role as any });
            if (error) throw error;

            if (user && profile) {
              recordAuditLog(user.id, profile.name, {
                action: "role_added",
                targetUserId: userId,
                details: { role, user_name: userName },
              });
            }

            toast({ title: "Role Added", description: `Added ${getRoleLabel(role)} to ${userName}` });
          }

          fetchApprovedUsers();
        } catch (error) {
          console.error("Error changing role:", error);
          toast({ title: "Error", description: "Failed to change user role", variant: "destructive" });
        } finally {
          setRoleChangeLoading(null);
        }
      },
    });
  };

  const handleChangeDepartment = async (userId: string, newDept: string, userName: string) => {
    setDeptChangeLoading(userId);
    try {
      const { error } = await supabase
        .from("employees")
        .update({ department: newDept })
        .eq("user_id", userId);

      if (error) throw error;

      toast({
        title: "Department Updated",
        description: `${userName}'s department has been changed to ${newDept}`,
      });

      fetchApprovedUsers();
    } catch (error) {
      console.error("Error changing department:", error);
      toast({
        title: "Error",
        description: "Failed to change department",
        variant: "destructive",
      });
    } finally {
      setDeptChangeLoading(null);
    }
  };

  const handleChangeManager = async (userId: string, managerId: string | null, userName: string) => {
    setManagerChangeLoading(userId);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ reporting_manager_id: managerId })
        .eq("user_id", userId);

      if (error) throw error;

      const managerName = managerId 
        ? approvedUsers.find(u => u.user_id === managerId)?.name 
        : null;

      toast({
        title: "Reporting Manager Updated",
        description: managerName 
          ? `${userName} now reports to ${managerName}`
          : `${userName} no longer has a reporting manager`,
      });

      fetchApprovedUsers();
    } catch (error) {
      console.error("Error changing manager:", error);
      toast({
        title: "Error",
        description: "Failed to change reporting manager",
        variant: "destructive",
      });
    } finally {
      setManagerChangeLoading(null);
    }
  };

  const getRoleLabel = (role: string) => {
    // Handle multi-role strings like "hr, admin"
    if (role.includes(",")) {
      return role.split(",").map(r => getRoleLabel(r.trim())).join(", ");
    }
    switch (role) {
      case "sales":
        return "Sales Team";
      case "supply_chain":
        return "Supply Chain";
      case "finance":
        return "Finance";
      case "admin":
        return "Admin";
      case "it":
        return "IT Team";
      case "marketing":
        return "Marketing Team";
      case "hr":
        return "HR Team";
      default:
        return role;
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin":
        return "destructive";
      case "supply_chain":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <Header />

      <main className="container mx-auto px-4 py-4 sm:py-8 flex-1 overflow-x-hidden">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">{isFinanceOnly ? "Payment Approvals" : "Admin Panel"}</h2>
          <p className="text-muted-foreground">
            {isFinanceOnly ? "Review and manage payment approvals" : "Analytics dashboard and user management"}
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="mb-6 h-auto flex-wrap justify-start">
            {!isFinanceOnly && (
              <>
                <TabsTrigger value="analytics" className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Analytics
                </TabsTrigger>
                <TabsTrigger value="payments" className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Payment Reminders
                </TabsTrigger>
              </>
            )}
            <TabsTrigger value="approvals" className="flex items-center gap-2">
              <Receipt className="w-4 h-4" />
              Payment Approvals
            </TabsTrigger>
            {!isFinanceOnly && (
              <>
                <TabsTrigger value="users" className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  User Management
                  {pendingUsers.length > 0 && (
                    <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                      {pendingUsers.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="integrations" className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Integrations
                </TabsTrigger>
                <TabsTrigger value="form-access" className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" />
                  Form Access
                </TabsTrigger>
                <TabsTrigger value="notices" className="flex items-center gap-2">
                  <Bell className="w-4 h-4" />
                  Notices
                </TabsTrigger>
                <TabsTrigger value="signature" className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4" />
                  Signature
                </TabsTrigger>
                <TabsTrigger value="activity" className="flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Activity
                </TabsTrigger>
                <TabsTrigger value="organization" className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Organization
                </TabsTrigger>
                <TabsTrigger value="attendance-policy" className="flex items-center gap-2">
                  <CalendarClock className="w-4 h-4" />
                  Attendance Policy
                </TabsTrigger>
                <TabsTrigger value="holidays" className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  Holidays
                </TabsTrigger>
                <TabsTrigger value="employee-activity" className="flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Employee Activity
                </TabsTrigger>
                <TabsTrigger value="agent-mapping" className="flex items-center gap-2">
                  <UserCog className="w-4 h-4" />
                  Agent Mapping
                </TabsTrigger>
                <TabsTrigger value="audit-logs" className="flex items-center gap-2" onClick={() => navigate("/admin/audit-logs")}>
                  <Shield className="w-4 h-4" />
                  Audit Logs
                </TabsTrigger>
                <TabsTrigger value="company-cleanup" className="flex items-center gap-2" onClick={() => navigate("/admin/company-cleanup")}>
                  <Building2 className="w-4 h-4" />
                  Company Cleanup
                </TabsTrigger>
                <TabsTrigger value="portal-dashboard" className="flex items-center gap-2" onClick={() => navigate("/admin/portal-dashboard")}>
                  <Activity className="w-4 h-4" />
                  Portal Dashboard
                </TabsTrigger>
                <TabsTrigger value="portal-customers" className="flex items-center gap-2" onClick={() => navigate("/admin/portal-customers")}>
                  <Briefcase className="w-4 h-4" />
                  Portal Customers
                </TabsTrigger>
                <TabsTrigger value="portal-rfqs" className="flex items-center gap-2" onClick={() => navigate("/admin/portal-rfqs")}>
                  <FileQuestion className="w-4 h-4" />
                  Portal RFQs
                </TabsTrigger>
                <TabsTrigger value="portal-orders" className="flex items-center gap-2" onClick={() => navigate("/admin/portal-orders")}>
                  <Package className="w-4 h-4" />
                  Portal Orders
                </TabsTrigger>
                <TabsTrigger value="portal-dispatch" className="flex items-center gap-2" onClick={() => navigate("/admin/portal-dispatch")}>
                  <Briefcase className="w-4 h-4" />
                  Dispatch Queue
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="analytics">
            <EnquiryAnalytics enquiries={enquiries} onValueFilterClick={handleValueFilterClick} />
          </TabsContent>

          <TabsContent value="payments">
            <PaymentRemindersCard orders={orders} />
          </TabsContent>

          <TabsContent value="approvals">
            <PendingPaymentApprovals orders={orders} />
          </TabsContent>

          <TabsContent value="users">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <Card className="glass">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-warning/10">
                      <Clock className="w-6 h-6 text-warning" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{pendingUsers.length}</p>
                      <p className="text-sm text-muted-foreground">Pending Approvals</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-primary/10">
                      <Users className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{approvedUsers.length}</p>
                      <p className="text-sm text-muted-foreground">Total Users</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-success/10">
                      <ShieldCheck className="w-6 h-6 text-success" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">5</p>
                      <p className="text-sm text-muted-foreground">Max Admins</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Invite User + Pending Invitations */}
            <Card className="glass mb-6">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="w-5 h-5" />
                    Pending Invitations
                  </CardTitle>
                  <CardDescription>
                    Invitations sent to users awaiting sign-up
                  </CardDescription>
                </div>
                <InviteUserDialog onUserInvited={fetchInvitations} />
              </CardHeader>
              <CardContent>
                {invitationsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : invitations.length === 0 ? (
                  <div className="text-center py-8">
                    <Mail className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No pending invitations</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Click "Invite User" to send a joining request
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {invitations.map((invitation) => (
                      <div
                        key={invitation.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{invitation.name}</p>
                            <Badge variant={getRoleBadgeVariant(invitation.role) as any}>
                              {getRoleLabel(invitation.role)}
                            </Badge>
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                              Invited
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{invitation.email}</p>
                          <p className="text-xs text-muted-foreground">
                            Invited: {new Date(invitation.invited_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <ActionWithCommentDialog
                            trigger={
                              <Button size="sm" disabled={actionLoading === invitation.id}>
                                {actionLoading === invitation.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                <span className="ml-1 hidden sm:inline">Approve</span>
                              </Button>
                            }
                            title="Approve Invitation"
                            description={`You are about to approve the invitation for ${invitation.name} (${invitation.email}).`}
                            confirmLabel="Approve"
                            loading={actionLoading === invitation.id}
                            onConfirm={(comment) => handleApproveInvitation(invitation.id, invitation.name, invitation.email, comment)}
                          />
                          <ActionWithCommentDialog
                            trigger={
                              <Button size="sm" variant="outline" className="text-destructive hover:text-destructive hover:bg-destructive/10" disabled={actionLoading === invitation.id}>
                                {actionLoading === invitation.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                                <span className="ml-1 hidden sm:inline">Cancel</span>
                              </Button>
                            }
                            title="Cancel Invitation"
                            description={`You are about to cancel the invitation for ${invitation.email}.`}
                            confirmLabel="Cancel Invitation"
                            confirmVariant="destructive"
                            loading={actionLoading === invitation.id}
                            onConfirm={(comment) => handleCancelInvitation(invitation.id, invitation.email, comment)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pending Registrations */}
            <Card className="glass">
              <CardHeader>
                <CardTitle>Pending Registrations</CardTitle>
                <CardDescription>
                  Review and approve or deny new user registrations
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : pendingUsers.length === 0 ? (
                  <div className="text-center py-8">
                    <ShieldCheck className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No pending registrations</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingUsers.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{user.name}</p>
                            <Badge variant={getRoleBadgeVariant(user.role) as any}>
                              {getRoleLabel(user.role)}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                          <p className="text-xs text-muted-foreground">
                            Registered: {new Date(user.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <ActionWithCommentDialog
                            trigger={
                              <Button size="sm" variant="outline" className="text-destructive hover:text-destructive hover:bg-destructive/10" disabled={actionLoading === user.user_id}>
                                {actionLoading === user.user_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                                <span className="ml-1 hidden sm:inline">Deny</span>
                              </Button>
                            }
                            title="Deny Registration"
                            description={`You are about to deny the registration for ${user.name}.`}
                            confirmLabel="Deny"
                            confirmVariant="destructive"
                            loading={actionLoading === user.user_id}
                            onConfirm={(comment) => handleDeny(user.user_id, user.name, comment)}
                          />
                          <ActionWithCommentDialog
                            trigger={
                              <Button size="sm" disabled={actionLoading === user.user_id}>
                                {actionLoading === user.user_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                <span className="ml-1 hidden sm:inline">Approve</span>
                              </Button>
                            }
                            title="Approve User"
                            description={`You are about to approve ${user.name}. They will gain access to the system.`}
                            confirmLabel="Approve"
                            loading={actionLoading === user.user_id}
                            onConfirm={(comment) => handleApprove(user.user_id, user.name, comment)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Approved Users with Password Reset */}
            <Card className="glass mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5" />
                  Approved Users
                </CardTitle>
                <CardDescription>
                  Manage approved users and reset their passwords
                </CardDescription>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : approvedUsers.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No approved users</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Column headings */}
                    <div className="hidden lg:flex items-center px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <div className="min-w-0 flex-1">User</div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="w-[140px] text-center">Department</span>
                        <span className="w-[130px] text-center">Role</span>
                        <span className="w-[150px] text-center">Manager</span>
                        <span className="w-[170px]"></span>
                      </div>
                    </div>
                    {approvedUsers.map((user) => (
                      <div
                        key={user.id}
                        className="flex flex-col lg:flex-row lg:items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border gap-4"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-medium">{user.name}</p>
                            {user.roles.map((r) => (
                              <Badge key={r} variant={getRoleBadgeVariant(r) as any} className="text-xs">
                                {getRoleLabel(r)}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Joined: {new Date(user.created_at).toLocaleDateString()}</span>
                            {user.reporting_manager_name && (
                              <span className="flex items-center gap-1">
                                <UserCog className="w-3 h-3" />
                                Reports to: {user.reporting_manager_name}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                          {/* Department Change Dropdown */}
                          <Select
                            value={user.department || "General"}
                            onValueChange={(value) => handleChangeDepartment(user.user_id, value, user.name)}
                            disabled={deptChangeLoading === user.user_id}
                          >
                            <SelectTrigger className="w-[140px] h-8">
                              {deptChangeLoading === user.user_id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <SelectValue />
                              )}
                            </SelectTrigger>
                            <SelectContent>
                              {orgDepartments.map((dept) => (
                                <SelectItem key={dept.id} value={dept.name}>{dept.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Multi-Role Assignment */}
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="w-[130px] h-8 justify-between text-xs" disabled={roleChangeLoading === user.user_id}>
                                {roleChangeLoading === user.user_id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>{user.roles.length} role{user.roles.length > 1 ? 's' : ''}</>
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-48 p-2 bg-popover border border-border z-50" align="start">
                              <div className="space-y-1">
                                {orgRoles.map((roleOption) => (
                                  <label
                                    key={roleOption.name}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer text-sm"
                                  >
                                    <Checkbox
                                      checked={user.roles.includes(roleOption.name)}
                                      onCheckedChange={() => handleToggleRole(user.user_id, roleOption.name, user.roles, user.name)}
                                    />
                                    {roleOption.label}
                                  </label>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                          <Select
                            value={user.reporting_manager_id || "none"}
                            onValueChange={(value) => handleChangeManager(
                              user.user_id, 
                              value === "none" ? null : value, 
                              user.name
                            )}
                            disabled={managerChangeLoading === user.user_id}
                          >
                            <SelectTrigger className="w-[150px] h-8">
                              {managerChangeLoading === user.user_id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <SelectValue placeholder="Set Manager" />
                              )}
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No Manager</SelectItem>
                              {approvedUsers
                                .filter(u => u.user_id !== user.user_id) // Can't be own manager
                                .map((u) => (
                                  <SelectItem key={u.user_id} value={u.user_id}>
                                    {u.name}
                                  </SelectItem>
                                ))
                              }
                            </SelectContent>
                          </Select>

                          {/* Approval History */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setHistoryUser({ userId: user.user_id, name: user.name, email: user.email })}
                            title="View approval history"
                          >
                            <History className="w-4 h-4" />
                          </Button>

                          {/* Reset Password */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResetPassword(user.email, user.name)}
                            disabled={resetLoading === user.email}
                          >
                            {resetLoading === user.email ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <KeyRound className="w-4 h-4" />
                            )}
                            <span className="ml-1 hidden sm:inline">Reset</span>
                          </Button>

                          {/* Reset MFA */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResetMFA(user.user_id, user.name)}
                            disabled={mfaResetLoading === user.user_id}
                            title="Remove all MFA factors for this user"
                          >
                            {mfaResetLoading === user.user_id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <ShieldOff className="w-4 h-4" />
                            )}
                            <span className="ml-1 hidden sm:inline">Reset MFA</span>
                          </Button>

                          {/* Delete User */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                disabled={deleteLoading === user.user_id}
                              >
                                {deleteLoading === user.user_id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete User</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete {user.name}? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteUser(user.user_id, user.name)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations">
            <div className="space-y-6">
              <LeadSyncHealthPanel />
              <SlackSettingsPanel />
              <MyOperatorSettingsPanel />
              <ExotelSettingsPanel />
              <WooCommerceSyncPanel />
            </div>
          </TabsContent>

          <TabsContent value="form-access">
            <FormPermissionsPanel />
          </TabsContent>

          <TabsContent value="notices">
            <NoticesPanel />
          </TabsContent>

          <TabsContent value="signature">
            <AdminSignatureSettings />
          </TabsContent>

          <TabsContent value="activity">
            <UserActivityTracker />
          </TabsContent>

          <TabsContent value="organization">
            <OrgSettingsPanel />
          </TabsContent>

          <TabsContent value="attendance-policy">
            <div className="mb-6">
              <h2 className="text-lg font-semibold">Attendance Policy Settings</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Configure thresholds and alert preferences. All alerts are off by default — enable them
                only after observing attendance patterns for 2–3 weeks.
              </p>
            </div>
            <AttendancePolicySettings />
          </TabsContent>

          <TabsContent value="holidays">
            <HolidayManagementPanel />
          </TabsContent>

          <TabsContent value="employee-activity">
            <AdminEmployeeActivity />
          </TabsContent>

          <TabsContent value="agent-mapping">
            <AgentMappingPanel />
          </TabsContent>
        </Tabs>
      </main>
      <ReAuthDialog
        open={reAuthState.open}
        onOpenChange={setReAuthOpen}
        title={reAuthState.title}
        description={reAuthState.description}
        onConfirmed={reAuthState.onConfirmed}
      />
      {historyUser && (
        <UserApprovalHistoryDialog
          open={!!historyUser}
          onOpenChange={(open) => !open && setHistoryUser(null)}
          userId={historyUser.userId}
          userName={historyUser.name}
          userEmail={historyUser.email}
        />
      )}
    </div>
  );
};

export default Admin;
