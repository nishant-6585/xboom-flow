import { useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePortalAuth } from "@/portal/hooks/usePortalAuth";

const STAFF_ROLES = new Set(["admin", "support", "supply_chain", "sales", "sales_manager"]);

export function PortalProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, contact, loading } = usePortalAuth();
  const { user: workflowUser, roles, loading: workflowLoading } = useAuth();
  const location = useLocation();
  const portalTicketId = location.pathname.match(/^\/portal\/tickets\/([^/?#]+)/)?.[1];
  const isStaffUser = useMemo(() => (roles ?? []).some((role) => STAFF_ROLES.has(role)), [roles]);

  if (loading || (user && workflowLoading)) {
    return (
      <div className="portal-scope min-h-[100dvh] bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (portalTicketId && workflowUser && isStaffUser && !contact) {
    return <Navigate to={`/admin/portal-tickets/${portalTicketId}`} replace />;
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
