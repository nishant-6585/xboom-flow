import { Badge } from "@/components/ui/badge";
import { CandidateStatus } from "@/hooks/useCandidates";

const config: Record<CandidateStatus, { label: string; className: string }> = {
  applied: { label: "Applied", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  shortlisted: { label: "Shortlisted", className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  rejected: { label: "Rejected", className: "bg-red-500/10 text-red-600 border-red-500/20" },
  hired: { label: "Hired", className: "bg-green-500/10 text-green-600 border-green-500/20" },
  blacklisted: { label: "Blacklisted", className: "bg-gray-500/10 text-gray-500 border-gray-500/20" },
};

export function CandidateStatusBadge({ status }: { status: CandidateStatus }) {
  const c = config[status] || { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={c.className}>
      {c.label}
    </Badge>
  );
}
