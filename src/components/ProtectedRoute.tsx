import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Clock, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireApproval?: boolean;
}

export const ProtectedRoute = ({ children, requireApproval = true }: ProtectedRouteProps) => {
  const { user, loading, isApproved, signOut, profile } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Check if user is approved (if required)
  if (requireApproval && !isApproved) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4 overflow-y-auto">
        <Card className="w-full max-w-md glass animate-fade-in my-auto">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-warning/10">
                <Clock className="w-8 h-8 text-warning" />
              </div>
            </div>
            <CardTitle className="text-2xl">Pending Approval</CardTitle>
            <CardDescription>
              Your account is awaiting admin approval
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Security Verification Required</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    For security purposes, all new registrations must be approved by an administrator before accessing the system.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Registered as: <span className="font-medium text-foreground">{profile?.email}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                You will be able to access the system once an admin approves your registration.
              </p>
            </div>

            <Button 
              variant="outline" 
              className="w-full" 
              onClick={signOut}
            >
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};
