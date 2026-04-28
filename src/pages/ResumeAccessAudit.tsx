import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, FileSearch, Loader2, RefreshCw, Search, ShieldAlert } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

type Reason =
  | "missing_path"
  | "unsupported_format"
  | "not_found"
  | "forbidden"
  | "unknown";

interface FailureRow {
  id: string;
  referral_id: string | null;
  document_path: string | null;
  reason: Reason;
  error_message: string | null;
  source: string | null;
  actor_user_id: string | null;
  actor_role: string | null;
  user_agent: string | null;
  created_at: string;
}

const ROLES = [
  { value: "all", label: "All roles" },
  { value: "admin", label: "Admin" },
  { value: "hr", label: "HR" },
  { value: "manager", label: "Manager" },
  { value: "sales_manager", label: "Sales Manager" },
  { value: "finance", label: "Finance" },
  { value: "employee", label: "Employee" },
];

const RANGES = [
  { value: "24h", label: "Last 24 hours", hours: 24 },
  { value: "7d", label: "Last 7 days", hours: 24 * 7 },
  { value: "30d", label: "Last 30 days", hours: 24 * 30 },
  { value: "90d", label: "Last 90 days", hours: 24 * 90 },
  { value: "all", label: "All time", hours: 0 },
] as const;

const reasonVariant = (
  r: Reason
): "default" | "secondary" | "destructive" | "outline" => {
  switch (r) {
    case "forbidden":
      return "destructive";
    case "not_found":
      return "destructive";
    case "unsupported_format":
      return "secondary";
    case "missing_path":
      return "outline";
    default:
      return "default";
  }
};

export default function ResumeAccessAudit() {
  const { role, isApproved, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [referralId, setReferralId] = useState("");
  const [pendingReferralId, setPendingReferralId] = useState("");
  const [actorRole, setActorRole] = useState<string>("all");
  const [range, setRange] = useState<(typeof RANGES)[number]["value"]>("7d");

  const { fromIso, toIso } = useMemo(() => {
    const cfg = RANGES.find((r) => r.value === range)!;
    if (cfg.hours === 0) return { fromIso: null, toIso: null };
    const to = new Date();
    const from = new Date(to.getTime() - cfg.hours * 60 * 60 * 1000);
    return { fromIso: from.toISOString(), toIso: to.toISOString() };
  }, [range]);

  const isAuthorized = role === "admin" || role === "hr";

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [
      "resume-access-failures",
      referralId || null,
      actorRole === "all" ? null : actorRole,
      fromIso,
      toIso,
    ],
    enabled: isAuthorized,
    queryFn: async (): Promise<FailureRow[]> => {
      const trimmed = referralId.trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        trimmed
      );
      const { data, error } = await (supabase as any).rpc(
        "list_resume_access_failures",
        {
          _referral_id: isUuid ? trimmed : null,
          _actor_role: actorRole === "all" ? null : actorRole,
          _from: fromIso,
          _to: toIso,
          _limit: 500,
        }
      );
      if (error) throw error;
      return (data as FailureRow[]) || [];
    },
  });

  if (!authLoading && (!isApproved || !isAuthorized)) {
    return <Navigate to="/" replace />;
  }

  const applyReferralFilter = () => {
    const trimmed = pendingReferralId.trim();
    if (
      trimmed &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        trimmed
      )
    ) {
      toast.error("Referral ID must be a valid UUID");
      return;
    }
    setReferralId(trimmed);
  };

  const rows = data || [];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-primary" />
                Resume Access Failures
              </h1>
              <p className="text-sm text-muted-foreground">
                Internal audit log of failed signed-URL generations for HR documents.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="referral-id" className="text-xs">
                  Referral ID
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="referral-id"
                      placeholder="UUID…"
                      value={pendingReferralId}
                      onChange={(e) => setPendingReferralId(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applyReferralFilter();
                      }}
                      className="pl-8 font-mono text-xs"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={applyReferralFilter}
                  >
                    Apply
                  </Button>
                  {referralId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPendingReferralId("");
                        setReferralId("");
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Actor role</Label>
                <Select value={actorRole} onValueChange={setActorRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Time range</Label>
                <Select
                  value={range}
                  onValueChange={(v) => setRange(v as typeof range)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RANGES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-16 flex justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                <FileSearch className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No failures match the current filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">When</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Referral</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(r.created_at), "dd MMM yyyy HH:mm:ss")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={reasonVariant(r.reason)}>
                            {r.reason}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.source || "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.actor_role || "—"}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {r.referral_id ? (
                            <button
                              className="hover:underline"
                              onClick={() => {
                                setPendingReferralId(r.referral_id!);
                                setReferralId(r.referral_id!);
                              }}
                              title="Filter by this referral"
                            >
                              {r.referral_id.slice(0, 8)}…
                            </button>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {r.actor_user_id
                            ? `${r.actor_user_id.slice(0, 8)}…`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs max-w-[320px]">
                          <div
                            className="truncate"
                            title={r.error_message || ""}
                          >
                            {r.error_message || "—"}
                          </div>
                          {r.document_path && (
                            <div
                              className="truncate text-muted-foreground"
                              title={r.document_path}
                            >
                              {r.document_path}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Showing up to 500 most recent entries. Restricted to Admin & HR.
        </p>
      </main>
    </div>
  );
}