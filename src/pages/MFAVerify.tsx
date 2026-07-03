import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { MFAVerification } from "@/components/auth/MFAVerification";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

const MFAVerify = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, loading, signOut, refreshMfaStatus, mfaStatus } = useAuth();

  const state = location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null;
  const redirectParam = searchParams.get("redirect");
  const storedRedirect = typeof window !== "undefined" ? window.sessionStorage.getItem("xboom_post_auth_redirect") : null;
  const fromPath = state?.from?.pathname;
  const stateTarget = fromPath ? `${fromPath}${state?.from?.search ?? ""}${state?.from?.hash ?? ""}` : null;
  const isSafeTarget = (value: string | null | undefined) =>
    !!value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/auth") && !value.startsWith("/mfa-verify");
  const target = isSafeTarget(redirectParam)
    ? redirectParam
    : isSafeTarget(stateTarget)
      ? stateTarget
      : isSafeTarget(storedRedirect)
        ? storedRedirect!
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
    sessionStorage.removeItem("xboom_post_auth_redirect");
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
        sessionStorage.removeItem("xboom_post_auth_redirect");
        navigate(target, { replace: true });
      }}
      onCancel={signOut}
    />
  );
};

export default MFAVerify;
