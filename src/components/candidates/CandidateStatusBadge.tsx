import { Badge } from "@/components/ui/badge";
import { CandidateStatus, LifecycleStatus, LIFECYCLE_LABELS } from "@/hooks/useCandidates";

const legacyConfig: Record<CandidateStatus, { label: string; className: string }> = {
  applied: { label: "Applied", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  shortlisted: { label: "Shortlisted", className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  rejected: { label: "Rejected", className: "bg-red-500/10 text-red-600 border-red-500/20" },
  hired: { label: "Hired", className: "bg-green-500/10 text-green-600 border-green-500/20" },
  blacklisted: { label: "Blacklisted", className: "bg-gray-500/10 text-gray-500 border-gray-500/20" },
};

const lifecycleConfig: Record<LifecycleStatus, { className: string }> = {
  NEW: { className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  SCREENING: { className: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20" },
  INTERVIEW: { className: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  SELECTED: { className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  OFFERED: { className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  JOINED: { className: "bg-green-500/10 text-green-600 border-green-500/20" },
  REJECTED: { className: "bg-red-500/10 text-red-600 border-red-500/20" },
  DROPPED: { className: "bg-gray-500/10 text-gray-500 border-gray-500/20" },
  ON_HOLD: { className: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
};

export function CandidateStatusBadge({ status }: { status: CandidateStatus }) {
  const c = legacyConfig[status] || { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={c.className}>
      {c.label}
    </Badge>
  );
}

export function LifecycleStatusBadge({ status }: { status: LifecycleStatus }) {
  const c = lifecycleConfig[status] || { className: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={c.className}>
      {LIFECYCLE_LABELS[status] || status}
    </Badge>
  );
}
