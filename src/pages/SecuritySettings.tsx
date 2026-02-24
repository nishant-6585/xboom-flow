import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Shield, Monitor, Smartphone, Globe, Clock, CheckCircle, XCircle, Ban,
  LogOut, ShieldCheck, ShieldOff, ArrowLeft, Loader2
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const SecuritySettings = () => {
  const { user, profile, roles, mfaStatus, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── Active Sessions ──
  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["user-sessions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_sessions")
        .select("*")
        .eq("is_active", true)
        .order("last_active_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const revokeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from("user_sessions")
        .update({ is_active: false, revoked_at: new Date().toISOString() })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-sessions"] });
      toast({ title: "Session revoked", description: "The session has been terminated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to revoke session.", variant: "destructive" });
    },
  });

  const revokeAllMutation = useMutation({
    mutationFn: async () => {
      // Revoke all sessions except current (we don't know which is current from client, so revoke all)
      const { error } = await supabase
        .from("user_sessions")
        .update({ is_active: false, revoked_at: new Date().toISOString() })
        .eq("is_active", true)
        .eq("is_current", false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-sessions"] });
      toast({ title: "All other sessions revoked", description: "Only your current session remains active." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to revoke sessions.", variant: "destructive" });
    },
  });

  // ── Login History ──
  const { data: loginHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ["login-history", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("login_history")
        .select("*")
        .order("attempted_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const getDeviceIcon = (deviceInfo: string | null) => {
    if (!deviceInfo) return <Globe className="w-5 h-5 text-muted-foreground" />;
    const lower = deviceInfo.toLowerCase();
    if (lower.includes("mobile") || lower.includes("iphone") || lower.includes("android")) {
      return <Smartphone className="w-5 h-5 text-muted-foreground" />;
    }
    return <Monitor className="w-5 h-5 text-muted-foreground" />;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge variant="outline" className="bg-success/10 text-success border-success/20"><CheckCircle className="w-3 h-3 mr-1" />Success</Badge>;
      case "failure":
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case "blocked":
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20"><Ban className="w-3 h-3 mr-1" />Blocked</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const isAdmin = roles.includes("admin");

  return (
    <div className="min-h-[100dvh] bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-2">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/10">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Security Settings</h1>
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="sessions">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="sessions">Active Sessions</TabsTrigger>
            <TabsTrigger value="mfa">MFA</TabsTrigger>
            <TabsTrigger value="history">Login History</TabsTrigger>
          </TabsList>

          {/* ── Active Sessions Tab ── */}
          <TabsContent value="sessions" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {sessions.length} active session{sessions.length !== 1 ? "s" : ""}
              </p>
              {sessions.filter(s => !s.is_current).length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => revokeAllMutation.mutate()}
                  disabled={revokeAllMutation.isPending}
                >
                  <LogOut className="w-4 h-4 mr-1" />
                  Revoke All Others
                </Button>
              )}
            </div>

            {sessionsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : sessions.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No active sessions found. Session tracking will begin on your next login.
                </CardContent>
              </Card>
            ) : (
              sessions.map((session) => (
                <Card key={session.id} className={session.is_current ? "border-primary/30" : ""}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        {getDeviceIcon(session.device_info)}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">
                              {session.browser || "Unknown Browser"}
                              {session.os ? ` on ${session.os}` : ""}
                            </span>
                            {session.is_current && (
                              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
                                Current
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                            {session.ip_address && <span>{session.ip_address}</span>}
                            {session.location && <span>• {session.location}</span>}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <Clock className="w-3 h-3" />
                            <span>Last active: {format(new Date(session.last_active_at), "dd MMM yyyy, HH:mm")}</span>
                          </div>
                        </div>
                      </div>
                      {!session.is_current && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive shrink-0"
                          onClick={() => revokeSessionMutation.mutate(session.id)}
                          disabled={revokeSessionMutation.isPending}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ── MFA Tab ── */}
          <TabsContent value="mfa" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  {mfaStatus === "verified" || mfaStatus === "not_required" ? (
                    <ShieldCheck className="w-5 h-5 text-success" />
                  ) : (
                    <ShieldOff className="w-5 h-5 text-warning" />
                  )}
                  Two-Factor Authentication
                </CardTitle>
                <CardDescription>
                  {isAdmin
                    ? "MFA is required for all admin accounts."
                    : "Add an extra layer of security to your account."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border">
                  <div>
                    <p className="font-medium text-sm">TOTP Authenticator</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {mfaStatus === "verified"
                        ? "Active — your account is protected with MFA"
                        : mfaStatus === "enrollment_required"
                        ? "Not enrolled — setup required"
                        : mfaStatus === "verification_required"
                        ? "Enrolled — pending verification this session"
                        : "Not configured"}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      mfaStatus === "verified"
                        ? "bg-success/10 text-success border-success/20"
                        : "bg-warning/10 text-warning border-warning/20"
                    }
                  >
                    {mfaStatus === "verified" ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                {isAdmin && mfaStatus !== "verified" && (
                  <p className="text-xs text-warning mt-3">
                    ⚠️ As an admin, MFA is mandatory. You will be prompted to set it up.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Login History Tab ── */}
          <TabsContent value="history" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">Last 10 login attempts</p>

            {historyLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : loginHistory.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No login history recorded yet.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {loginHistory.map((entry: any) => (
                  <Card key={entry.id}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          {getDeviceIcon(entry.device_info)}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">
                                {format(new Date(entry.attempted_at), "dd MMM yyyy, HH:mm")}
                              </span>
                              {getStatusBadge(entry.status)}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                              {entry.ip_address && <span>{entry.ip_address}</span>}
                              {entry.browser && <span>• {entry.browser}</span>}
                              {entry.failure_reason && entry.status !== "success" && (
                                <span className="text-destructive">• {entry.failure_reason}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default SecuritySettings;
