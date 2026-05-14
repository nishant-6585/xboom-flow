import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { usePortalAuth } from "@/portal/hooks/usePortalAuth";

export function PortalProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, contact, loading } = usePortalAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="portal-scope min-h-[100dvh] bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/portal/login" state={{ from: location }} replace />;
  }

  // Logged in via Supabase auth, but no portal_contact row → not a portal customer
  if (!contact) {
    return <Navigate to="/portal/login?error=not_portal_user" replace />;
  }

  if (!contact.is_active) {
    return <Navigate to="/portal/login?error=account_suspended" replace />;
  }

  return <>{children}</>;
}
