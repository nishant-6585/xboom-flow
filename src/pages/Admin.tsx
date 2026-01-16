import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
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
import { Check, X, Users, ShieldCheck, Clock, Loader2, BarChart3, CreditCard, Receipt, KeyRound, Trash2, UserCog, MessageSquare } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Navigate, useNavigate } from "react-router-dom";
import { SlackSettingsPanel } from "@/components/admin/SlackSettingsPanel";

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
  reporting_manager_id: string | null;
  reporting_manager_name?: string;
}

const Admin = () => {
  const { role, isApproved } = useAuth();
  const { toast } = useToast();
  const { enquiries } = useEnquiries();
  const { orders } = useOrders();
  const navigate = useNavigate();
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<ApprovedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [roleChangeLoading, setRoleChangeLoading] = useState<string | null>(null);
  const [managerChangeLoading, setManagerChangeLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("analytics");

  const handleValueFilterClick = (filterType: ValueFilterType, specificDate?: Date) => {
    // Navigate to main page with filter params
    const params = new URLSearchParams();
    params.set("valueFilter", filterType);
    if (specificDate) {
      params.set("valueDate", specificDate.toISOString());
    }
    navigate(`/?${params.toString()}`);
  };

  // Redirect if not admin or not approved
  if (role !== "admin" || !isApproved) {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    fetchPendingUsers();
    fetchApprovedUsers();
  }, []);

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

      // Create a name lookup map
      const nameMap = new Map<string, string>();
      (profiles || []).forEach((p) => nameMap.set(p.user_id, p.name));

      // Combine profiles with roles and manager names
      const usersWithRoles = (profiles || []).map((profile) => {
        const userRole = roles?.find((r) => r.user_id === profile.user_id);
        return {
          ...profile,
          role: userRole?.role || "unknown",
          reporting_manager_name: profile.reporting_manager_id 
            ? nameMap.get(profile.reporting_manager_id) || null 
            : null,
        };
      });

      setApprovedUsers(usersWithRoles);
    } catch (error) {
      console.error("Error fetching approved users:", error);
    } finally {
      setUsersLoading(false);
    }
  };

  const handleApprove = async (userId: string, userName: string) => {
    setActionLoading(userId);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_approved: true })
        .eq("user_id", userId);

      if (error) throw error;

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

  const handleDeny = async (userId: string, userName: string) => {
    setActionLoading(userId);
    try {
      // Delete the user's profile and role (cascade will handle cleanup)
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("user_id", userId);

      if (error) throw error;

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
    setDeleteLoading(userId);
    try {
      // Delete user role first
      const { error: roleError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      if (roleError) throw roleError;

      // Delete user profile
      const { error: profileError } = await supabase
        .from("profiles")
        .delete()
        .eq("user_id", userId);

      if (profileError) throw profileError;

      toast({
        title: "User Deleted",
        description: `${userName} has been removed from the system`,
      });

      fetchApprovedUsers();
    } catch (error) {
      console.error("Error deleting user:", error);
      toast({
        title: "Error",
        description: "Failed to delete user",
        variant: "destructive",
      });
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleChangeRole = async (userId: string, newRole: string, userName: string) => {
    setRoleChangeLoading(userId);
    try {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: newRole as any })
        .eq("user_id", userId);

      if (error) throw error;

      toast({
        title: "Role Updated",
        description: `${userName}'s role has been changed to ${getRoleLabel(newRole)}`,
      });

      fetchApprovedUsers();
    } catch (error) {
      console.error("Error changing role:", error);
      toast({
        title: "Error",
        description: "Failed to change user role",
        variant: "destructive",
      });
    } finally {
      setRoleChangeLoading(null);
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
    switch (role) {
      case "sales":
        return "Sales Team";
      case "supply_chain":
        return "Supply Chain";
      case "finance":
        return "Finance";
      case "admin":
        return "Admin";
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
          <h2 className="text-2xl font-bold mb-2">Admin Panel</h2>
          <p className="text-muted-foreground">
            Analytics dashboard and user management
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="payments" className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Payment Reminders
            </TabsTrigger>
            <TabsTrigger value="approvals" className="flex items-center gap-2">
              <Receipt className="w-4 h-4" />
              Payment Approvals
            </TabsTrigger>
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
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeny(user.user_id, user.name)}
                            disabled={actionLoading === user.user_id}
                          >
                            {actionLoading === user.user_id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <X className="w-4 h-4" />
                            )}
                            <span className="ml-1 hidden sm:inline">Deny</span>
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleApprove(user.user_id, user.name)}
                            disabled={actionLoading === user.user_id}
                          >
                            {actionLoading === user.user_id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                            <span className="ml-1 hidden sm:inline">Approve</span>
                          </Button>
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
                    {approvedUsers.map((user) => (
                      <div
                        key={user.id}
                        className="flex flex-col lg:flex-row lg:items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border gap-4"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{user.name}</p>
                            <Badge variant={getRoleBadgeVariant(user.role) as any}>
                              {getRoleLabel(user.role)}
                            </Badge>
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
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Role Change Dropdown */}
                          <Select
                            value={user.role}
                            onValueChange={(value) => handleChangeRole(user.user_id, value, user.name)}
                            disabled={roleChangeLoading === user.user_id}
                          >
                            <SelectTrigger className="w-[130px] h-8">
                              {roleChangeLoading === user.user_id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <SelectValue />
                              )}
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sales">Sales Team</SelectItem>
                              <SelectItem value="supply_chain">Supply Chain</SelectItem>
                              <SelectItem value="finance">Finance</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>

                          {/* Reporting Manager Dropdown */}
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
            <SlackSettingsPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
