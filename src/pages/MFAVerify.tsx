import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { MFAVerification } from "@/components/auth/MFAVerification";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

const MFAVerify = () => {
  const navigate = useNavigate();
  const { user, loading, signOut, refreshMfaStatus, mfaStatus } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // No user — go to login
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Already verified — go to dashboard
  if (mfaStatus !== "verification_required" && mfaStatus !== "enrollment_required") {
    return <Navigate to="/" replace />;
  }

  return (
    <MFAVerification
      onVerified={() => {
        refreshMfaStatus();
        navigate("/", { replace: true });
      }}
      onCancel={signOut}
    />
  );
};

export default MFAVerify;
