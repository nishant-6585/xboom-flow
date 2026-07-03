import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { MFAVerification } from "@/components/auth/MFAVerification";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

const MFAVerify = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, signOut, refreshMfaStatus, mfaStatus } = useAuth();

  const state = location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null;
  const fromPath = state?.from?.pathname;
  const target = fromPath && fromPath !== "/auth" && fromPath !== "/mfa-verify"
    ? `${fromPath}${state?.from?.search ?? ""}${state?.from?.hash ?? ""}`
    : "/";

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // No user — go to login
  if (!user) {
    return <Navigate to="/auth" replace state={location.state} />;
  }

  // Already verified — go to dashboard
  if (mfaStatus !== "verification_required" && mfaStatus !== "enrollment_required") {
    return <Navigate to={target} replace />;
  }

  console.log("[MFA] MFA_TRIGGERED_AT:", new Date().toISOString(), {
    userId: user?.id,
    mfaStatus,
    route: window.location.pathname,
  });

  return (
    <MFAVerification
      onVerified={async () => {
        await refreshMfaStatus();
        navigate(target, { replace: true });
      }}
      onCancel={signOut}
    />
  );
};

export default MFAVerify;
