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
import { EnquiryAnalytics } from "@/components/EnquiryAnalytics";
import { PaymentRemindersCard } from "@/components/PaymentRemindersCard";
import { PendingPaymentApprovals } from "@/components/PendingPaymentApprovals";
import { Check, X, Users, ShieldCheck, Clock, Loader2, BarChart3, CreditCard, Receipt } from "lucide-react";

interface PendingUser {
  id: string;
  user_id: string;
  name: string;
  email: string;
  is_approved: boolean;
  created_at: string;
  role: string;
}

import { Navigate } from "react-router-dom";

const Admin = () => {
  const { role, isApproved } = useAuth();
  const { toast } = useToast();
  const { enquiries } = useEnquiries();
  const { orders } = useOrders();
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("analytics");

  // Redirect if not admin or not approved
  if (role !== "admin" || !isApproved) {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    fetchPendingUsers();
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

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "sales":
        return "Sales Team";
      case "supply_chain":
        return "Supply Chain";
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
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
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
          </TabsList>

          <TabsContent value="analytics">
            <EnquiryAnalytics enquiries={enquiries} />
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
                      <p className="text-2xl font-bold">-</p>
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
                      <p className="text-2xl font-bold">2</p>
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
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
