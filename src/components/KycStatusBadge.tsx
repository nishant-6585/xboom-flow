import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, ShieldQuestion, Shield } from "lucide-react";
import { kycStatusMeta, type KycStatus, useOrderKycStatus } from "@/hooks/useKyc";

interface Props {
  status?: KycStatus | null;
  customerEmail?: string | null;
  size?: "sm" | "md";
}

/** Compact KYC status pill — accepts an explicit status or resolves by email. */
export function KycStatusBadge({ status, customerEmail, size = "sm" }: Props) {
  const resolved = useOrderKycStatus(status ? null : customerEmail);
  const effective: KycStatus = status ?? resolved.status ?? "not_submitted";
  const meta = kycStatusMeta(effective);
  const Icon =
    effective === "approved" ? ShieldCheck :
    effective === "rejected" || effective === "resubmission_required" ? ShieldAlert :
    effective === "pending_verification" ? ShieldQuestion :
    Shield;
  return (
    <Badge
      variant="outline"
      className={`${meta.className} ${size === "sm" ? "text-xs" : "text-sm"} gap-1 font-medium`}
      title={`KYC: ${meta.label}`}
    >
      <Icon className="h-3 w-3" />
      KYC: {meta.label}
    </Badge>
  );
}