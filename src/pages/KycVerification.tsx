import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useKycQueue, kycStatusMeta, type KycQueueRow } from "@/hooks/useKyc";
import { format, isToday, isYesterday, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks } from "date-fns";
import { Eye, Check, X, Loader2, ShieldCheck, Search, Sparkles, RotateCcw } from "lucide-react";
import { Header } from "@/components/Header";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

const REJECT_CATEGORIES: { value: string; label: string }[] = [
  { value: "document_unclear", label: "Document unclear" },
  { value: "name_mismatch", label: "Name mismatch" },
  { value: "expired_invalid", label: "Expired / invalid" },
  { value: "wrong_document", label: "Wrong document" },
  { value: "other", label: "Other" },
];

function formatDocType(t?: string | null): string {
  switch (t) {
    case "aadhaar": return "Aadhaar";
    case "pan": return "PAN";
    case "driving_license": return "Driving Licence";
    case "voter_id": return "Voter ID";
    case "passport": return "Passport";
    case "rental_agreement": return "Rental Agreement";
    case "other_gov_id": return "Other Govt ID";
    default: return t ? t : "—";
  }
}

/** Best-effort extraction of the identifier to display in the "Number" column.
 * DigiLocker submissions store a masked value under metadata.masked_document_number
 * (e.g. "XXXXXX 917M"); manual submissions store the number under metadata.document_reference.
 * Aadhaar is handled separately via the reveal button. */
function extractDocNumber(doc: any): string | null {
  const meta = (doc?.metadata as any) || {};
  const raw =
    meta.masked_document_number ||
    meta.document_reference ||
    meta.document_number ||
    null;
  if (!raw || typeof raw !== "string") return null;
  const v = raw.trim();
  return v.length ? v : null;
}

function AiRecommendationBadge({ ai }: { ai: NonNullable<KycQueueRow["ai_review"]> }) {
  const map: Record<string, string> = {
    likely_approve: "bg-emerald-50 text-emerald-800 border-emerald-200",
    likely_reject: "bg-red-50 text-red-800 border-red-200",
    unclear: "bg-slate-50 text-slate-700 border-slate-200",
  };
  const label: Record<string, string> = {
    likely_approve: "AI: likely approve",
    likely_reject: "AI: likely reject",
    unclear: "AI: unclear",
  };
  const cls = map[ai.recommendation] ?? map.unclear;
  const text = label[ai.recommendation] ?? `AI: ${ai.recommendation}`;
  return (
    <Badge variant="outline" className={`${cls} text-[10px] flex items-center gap-1`}>
      <Sparkles className="h-3 w-3" /> {text}
    </Badge>
  );
}

/**
 * Human-readable explanation of why a submission is still pending, so
 * reviewers don't have to open the drawer to see what didn't reconcile.
 * Returns null when the row isn't pending (approved/rejected already
 * carry their own reason text).
 */
function computePendingReason(
  r: KycQueueRow,
  effectiveStatus: string,
  isDigilocker: boolean,
): { headline: string; details?: string[] } | null {
  if (effectiveStatus !== "pending_verification") return null;

  const meta = (r.document?.metadata as any) || {};
  const expected =
    r.ai_review?.expected_name ||
    r.account.primary_contact_name ||
    r.account.company_name ||
    null;

  // DigiLocker: auto-approve is blocked when the DL holder name doesn't
  // match the customer name on the order. Surface both names explicitly.
  if (isDigilocker) {
    const holder = meta.holder_name || r.ai_review?.extracted_holder_name || null;
    const details: string[] = [];
    if (holder && expected) {
      details.push(`DigiLocker holder: "${holder}"`);
      details.push(`Expected: "${expected}"`);
    }
    return {
      headline: "DigiLocker name didn't match — reviewer sign-off needed",
      details,
    };
  }

  const ai = r.ai_review;
  if (ai) {
    const details: string[] = [];
    if (ai.type_match === false) {
      details.push(
        `Document type mismatch (declared ${formatDocType(ai.declared_doc_type)}, detected ${formatDocType(ai.extracted_doc_type)})`,
      );
    }
    if (ai.number_match === false) {
      details.push("Document number doesn't match what customer entered");
    }
    if (typeof ai.name_match_score === "number" && ai.name_match_score < 0.75) {
      const pct = Math.round(ai.name_match_score * 100);
      const holder = ai.extracted_holder_name || "—";
      details.push(`Name match ${pct}% (document: "${holder}" vs expected "${expected ?? "—"}")`);
    }
    if (ai.legibility && ai.legibility.toLowerCase() !== "good") {
      details.push(`Legibility: ${ai.legibility}`);
    }
    if (Array.isArray(ai.flags) && ai.flags.length > 0) {
      details.push(`Flags: ${ai.flags.join(", ")}`);
    }
    if (ai.error) {
      details.push(`AI error: ${ai.error}`);
    }

    if (ai.recommendation === "likely_reject") {
      return {
        headline: "AI recommends reject — reviewer must confirm",
        details: details.length ? details : ["AI flagged this submission as likely reject"],
      };
    }
    if (ai.recommendation === "unclear") {
      return {
        headline: "AI couldn't decide — reviewer must confirm",
        details: details.length ? details : ["AI confidence too low for auto-approval"],
      };
    }
    // likely_approve but still pending — policy is that AI never auto-approves,
    // so make that explicit instead of leaving the reviewer guessing.
    return {
      headline: "AI recommends approve — awaiting reviewer sign-off",
      details,
    };
  }

  if (r.document?.doc_type === "aadhaar") {
    return {
      headline: "Aadhaar — manual review required",
      details: ["AI is intentionally skipped for Aadhaar to protect the number"],
    };
  }

  return {
    headline: "Awaiting reviewer decision",
    details: ["AI analysis not available for this submission yet"],
  };
}

function StatCard({ label, value, tone, onClick, active }: {
  label: string;
  value: number;
  tone?: "green" | "orange" | "red";
  onClick?: () => void;
  active?: boolean;
}) {
  const toneCls =
    tone === "green" ? "text-emerald-600" :
    tone === "orange" ? "text-orange-500" :
    tone === "red" ? "text-red-600" :
    "text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border bg-card p-3 transition hover:border-primary/60 hover:shadow-sm ${active ? "border-primary ring-1 ring-primary/40" : "border-border"}`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${toneCls}`}>{value}</div>
    </button>
  );
}

export default function KycVerification() {
  const { rows, loading, review, getSignedUrl, getAadhaarFull } = useKycQueue();
  const [params] = useSearchParams();
  const focusAccount = params.get("account");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [repFilter, setRepFilter] = useState<string>("all");
  const [aiFilter, setAiFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("all");
  const [reviewing, setReviewing] = useState<{ row: KycQueueRow; mode: "approve" | "reject" } | null>(null);
  const [reason, setReason] = useState("");
  const [reasonCategory, setReasonCategory] = useState<string>("document_unclear");
  const [busy, setBusy] = useState(false);
  const [aadhaarMap, setAadhaarMap] = useState<Record<string, string>>({});

  const effStatus = (r: KycQueueRow) => (r.document?.status as any) ?? r.account.kyc_status;
  const rowMethod = (r: KycQueueRow): "digilocker" | "manual" | null => {
    if (!r.document) return null;
    const m = r.document.method || (r.document.metadata as any)?.method;
    return m === "digilocker" ? "digilocker" : "manual";
  };

  const repOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.rep_name) set.add(r.rep_name); });
    return Array.from(set).sort();
  }, [rows]);

  const inDateRange = (r: KycQueueRow) => {
    if (dateRange === "all") return true;
    const ts = r.account.kyc_submitted_at ? new Date(r.account.kyc_submitted_at) : null;
    if (!ts) return false;
    const now = new Date();
    switch (dateRange) {
      case "today": return isToday(ts);
      case "yesterday": return isYesterday(ts);
      case "this_week": return ts >= startOfWeek(now, { weekStartsOn: 1 }) && ts <= endOfWeek(now, { weekStartsOn: 1 });
      case "last_week": {
        const lw = subWeeks(now, 1);
        return ts >= startOfWeek(lw, { weekStartsOn: 1 }) && ts <= endOfWeek(lw, { weekStartsOn: 1 });
      }
      case "this_month": return ts >= startOfMonth(now) && ts <= endOfMonth(now);
      default: return true;
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (q) {
        const hit = [r.account.company_name, r.account.primary_contact_name, r.latest_order_number, r.customer_email, r.rep_name]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q));
        if (!hit) return false;
      }
      if (statusFilter !== "all" && effStatus(r) !== statusFilter) return false;
      if (docTypeFilter !== "all" && r.document?.doc_type !== docTypeFilter) return false;
      if (methodFilter !== "all" && rowMethod(r) !== methodFilter) return false;
      if (repFilter !== "all" && (r.rep_name || "") !== repFilter) return false;
      if (aiFilter !== "all") {
        if (aiFilter === "none") { if (r.ai_review) return false; }
        else if (r.ai_review?.recommendation !== aiFilter) return false;
      }
      if (!inDateRange(r)) return false;
      return true;
    });
    if (focusAccount) list = [...list].sort((a, b) => (a.account.id === focusAccount ? -1 : b.account.id === focusAccount ? 1 : 0));
    return list;
  }, [rows, search, statusFilter, docTypeFilter, methodFilter, repFilter, aiFilter, dateRange, focusAccount]);

  const stats = useMemo(() => {
    let total = 0, pending = 0, approved = 0, rejected = 0;
    let digilocker = 0, manual = 0;
    let aiApprove = 0, aiReject = 0, aiUnclear = 0;
    let todayCount = 0;
    rows.forEach((r) => {
      total++;
      const s = effStatus(r);
      if (s === "pending_verification") pending++;
      else if (s === "approved") approved++;
      else if (s === "rejected") rejected++;
      const m = rowMethod(r);
      if (m === "digilocker") digilocker++;
      else if (m === "manual") manual++;
      if (r.ai_review && s === "pending_verification") {
        if (r.ai_review.recommendation === "likely_approve") aiApprove++;
        else if (r.ai_review.recommendation === "likely_reject") aiReject++;
        else aiUnclear++;
      }
      if (r.account.kyc_submitted_at && isToday(new Date(r.account.kyc_submitted_at))) todayCount++;
    });
    return { total, pending, approved, rejected, digilocker, manual, aiApprove, aiReject, aiUnclear, todayCount };
  }, [rows]);

  const filtersActive = search || statusFilter !== "all" || docTypeFilter !== "all" || methodFilter !== "all" || repFilter !== "all" || aiFilter !== "all" || dateRange !== "all";
  const resetFilters = () => {
    setSearch(""); setStatusFilter("all"); setDocTypeFilter("all"); setMethodFilter("all"); setRepFilter("all"); setAiFilter("all"); setDateRange("all");
  };

  useEffect(() => {
    if (focusAccount && rows.length) {
      const el = document.getElementById(`kyc-row-${focusAccount}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusAccount, rows]);

  async function viewDoc(path: string) {
    try { window.open(await getSignedUrl(path), "_blank"); } catch {}
  }

  async function revealAadhaar(accountId: string) {
    if (aadhaarMap[accountId]) return;
    try {
      const v = await getAadhaarFull(accountId);
      if (v) setAadhaarMap((m) => ({ ...m, [accountId]: v.replace(/(\d{4})(?=\d)/g, "$1 ") }));
    } catch {}
  }

  async function confirm() {
    if (!reviewing || !reviewing.row.document) return;
    setBusy(true);
    const finalReason = reviewing.mode === "reject"
      ? `${REJECT_CATEGORIES.find((c) => c.value === reasonCategory)?.label ?? reasonCategory}${reason.trim() ? ` — ${reason.trim()}` : ""}`
      : undefined;
    const ok = await review(
      reviewing.row.account.id,
      reviewing.row.document.id,
      reviewing.mode,
      finalReason,
    );
    setBusy(false);
    if (ok) { setReviewing(null); setReason(""); setReasonCategory("document_unclear"); }
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <Header />
      <main className="container mx-auto px-4 py-6 max-w-7xl space-y-6 flex-1">
        <div className="flex items-center gap-3">
        <ShieldCheck className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">KYC Verification Queue</h1>
          <p className="text-sm text-muted-foreground">Review customer-submitted identity documents.</p>
        </div>
        </div>

      {/* Analytics stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total" value={stats.total} onClick={() => setStatusFilter("all")} active={statusFilter === "all"} />
        <StatCard label="Pending" value={stats.pending} tone="orange" onClick={() => setStatusFilter("pending_verification")} active={statusFilter === "pending_verification"} />
        <StatCard label="Approved" value={stats.approved} tone="green" onClick={() => setStatusFilter("approved")} active={statusFilter === "approved"} />
        <StatCard label="Rejected" value={stats.rejected} tone="red" onClick={() => setStatusFilter("rejected")} active={statusFilter === "rejected"} />
        <StatCard label="DigiLocker" value={stats.digilocker} onClick={() => setMethodFilter("digilocker")} active={methodFilter === "digilocker"} />
        <StatCard label="Manual upload" value={stats.manual} onClick={() => setMethodFilter("manual")} active={methodFilter === "manual"} />
        <StatCard label="AI · likely approve" value={stats.aiApprove} tone="green" onClick={() => setAiFilter("likely_approve")} active={aiFilter === "likely_approve"} />
        <StatCard label="AI · likely reject" value={stats.aiReject} tone="red" onClick={() => setAiFilter("likely_reject")} active={aiFilter === "likely_reject"} />
        <StatCard label="AI · unclear" value={stats.aiUnclear} onClick={() => setAiFilter("unclear")} active={aiFilter === "unclear"} />
        <StatCard label="Uploaded today" value={stats.todayCount} onClick={() => setDateRange("today")} active={dateRange === "today"} />
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">{filtered.length} of {rows.length} {rows.length === 1 ? "account" : "accounts"}</CardTitle>
            <div className="flex items-center gap-2">
              {filtersActive && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
                </Button>
              )}
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search customer, order…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { v: "all", l: "All time" },
              { v: "today", l: "Today" },
              { v: "yesterday", l: "Yesterday" },
              { v: "this_week", l: "This week" },
              { v: "last_week", l: "Last week" },
              { v: "this_month", l: "This month" },
            ].map((d) => (
              <Button
                key={d.v}
                size="sm"
                variant={dateRange === d.v ? "default" : "outline"}
                onClick={() => setDateRange(d.v)}
              >
                {d.l}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending_verification">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="not_submitted">Not submitted</SelectItem>
              </SelectContent>
            </Select>
            <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
              <SelectTrigger><SelectValue placeholder="Document type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All documents</SelectItem>
                <SelectItem value="aadhaar">Aadhaar</SelectItem>
                <SelectItem value="pan">PAN</SelectItem>
                <SelectItem value="driving_license">Driving Licence</SelectItem>
                <SelectItem value="voter_id">Voter ID</SelectItem>
                <SelectItem value="passport">Passport</SelectItem>
                <SelectItem value="rental_agreement">Rental Agreement</SelectItem>
                <SelectItem value="other_gov_id">Other Govt ID</SelectItem>
              </SelectContent>
            </Select>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger><SelectValue placeholder="Method" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All methods</SelectItem>
                <SelectItem value="digilocker">DigiLocker</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
            <Select value={repFilter} onValueChange={setRepFilter}>
              <SelectTrigger><SelectValue placeholder="Salesperson" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All salespersons</SelectItem>
                {repOptions.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={aiFilter} onValueChange={setAiFilter}>
              <SelectTrigger><SelectValue placeholder="AI recommendation" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All AI</SelectItem>
                <SelectItem value="likely_approve">Likely approve</SelectItem>
                <SelectItem value="likely_reject">Likely reject</SelectItem>
                <SelectItem value="unclear">Unclear</SelectItem>
                <SelectItem value="none">No AI review</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No KYC submissions yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/80 font-bold text-foreground">
                    <TableHead>Order #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Salesperson</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Approved / Reviewed by</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    // Prefer per-submission status so approve/reject reflects the latest doc,
                    // not a stale account-level flag.
                    const effectiveStatus = (r.document?.status as any) ?? r.account.kyc_status;
                    const meta = kycStatusMeta(effectiveStatus);
                    const canReview = effectiveStatus === "pending_verification" && r.document;
                    const isDlMismatch =
                      effectiveStatus === "pending_verification" &&
                      (r.document?.metadata as any)?.method === "digilocker";
                    const isDigilocker =
                      (r.document?.method === "digilocker") ||
                      ((r.document?.metadata as any)?.method === "digilocker");
                    const docNumber = extractDocNumber(r.document);
                    return (
                      <TableRow
                        key={r.account.id}
                        id={`kyc-row-${r.account.id}`}
                        className={focusAccount === r.account.id ? "bg-primary/5" : ""}
                      >
                        <TableCell className="font-mono text-xs">{r.latest_order_number || "—"}</TableCell>
                        <TableCell>
                          <div className="font-medium">{r.account.primary_contact_name || r.account.company_name}</div>
                          <div className="text-xs text-muted-foreground">{r.customer_email || r.account.company_name}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatDocType(r.document?.doc_type)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.document?.doc_type === "aadhaar" || !r.document ? (
                            aadhaarMap[r.account.id] ? (
                              aadhaarMap[r.account.id]
                            ) : (
                              <button className="underline text-primary" onClick={() => revealAadhaar(r.account.id)}>
                                XXXX XXXX {r.account.aadhaar_last4 || "----"}
                              </button>
                            )
                          ) : (
                            docNumber || "—"
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.account.kyc_submitted_at ? format(new Date(r.account.kyc_submitted_at), "dd MMM, HH:mm") : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{r.rep_name || "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 items-start max-w-[260px]">
                            <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                            {r.ai_review && effectiveStatus === "pending_verification" && (
                              <AiRecommendationBadge ai={r.ai_review} />
                            )}
                            {(() => {
                              const reason = computePendingReason(r, effectiveStatus, isDigilocker);
                              if (!reason) return null;
                              return (
                                <TooltipProvider delayDuration={150}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex items-start gap-1 text-[11px] leading-snug text-muted-foreground cursor-help">
                                        <Info className="h-3 w-3 mt-0.5 flex-shrink-0 text-amber-600" />
                                        <span className="whitespace-normal break-words">{reason.headline}</span>
                                      </div>
                                    </TooltipTrigger>
                                    {reason.details && reason.details.length > 0 && (
                                      <TooltipContent className="max-w-xs text-xs">
                                        <ul className="space-y-0.5">
                                          {reason.details.map((d, i) => (
                                            <li key={i}>• {d}</li>
                                          ))}
                                        </ul>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            })()}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs align-top max-w-[220px]">
                          {effectiveStatus === "approved" || effectiveStatus === "rejected" ? (
                            <div className="flex flex-col gap-0.5">
                              {r.document?.reviewed_by ? (
                                <span className="font-medium">{r.reviewer_name || "Staff"}</span>
                              ) : effectiveStatus === "approved" && r.ai_review && (r.ai_review.decision === "auto_approved" || r.ai_review.recommendation === "likely_approve") ? (
                                <TooltipProvider delayDuration={150}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="font-medium text-violet-700 inline-flex items-center gap-1 cursor-help">
                                        <Sparkles className="h-3 w-3" /> AI (auto)
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs text-xs">
                                      <div className="space-y-0.5">
                                        <div>Auto-approved by AI{r.ai_review.model ? ` · ${r.ai_review.model}` : ""}</div>
                                        {r.ai_review.ai_confidence != null && (
                                          <div>Confidence: {(r.ai_review.ai_confidence * 100).toFixed(0)}%</div>
                                        )}
                                        {r.ai_review.name_match_score != null && (
                                          <div>Name match: {(r.ai_review.name_match_score * 100).toFixed(0)}%</div>
                                        )}
                                        {r.ai_review.number_match != null && (
                                          <div>Number match: {r.ai_review.number_match ? "✓" : "✗"}</div>
                                        )}
                                        {r.ai_review.type_match != null && (
                                          <div>Type match: {r.ai_review.type_match ? "✓" : "✗"}</div>
                                        )}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : isDigilocker ? (
                                <span className="font-medium text-emerald-700">DigiLocker (auto)</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                              {r.document?.reviewed_at && (
                                <span className="text-muted-foreground">
                                  {format(new Date(r.document.reviewed_at), "dd MMM, HH:mm")}
                                </span>
                              )}
                              {effectiveStatus === "rejected" && r.document?.rejection_reason && (
                                <span className="text-red-700 whitespace-normal break-words">
                                  Reason: {r.document.rejection_reason}
                                </span>
                              )}
                              {effectiveStatus === "approved" && r.document?.reviewed_by && r.document?.doc_type === "aadhaar" && (
                                <TooltipProvider delayDuration={150}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="mt-1 inline-flex items-start gap-1 text-[11px] leading-snug text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5 cursor-help whitespace-normal break-words">
                                        <Sparkles className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                        <span>Manual review — AI skipped for Aadhaar (data-localization)</span>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs text-xs">
                                      AI is intentionally skipped for Aadhaar to keep the document off the external vision provider (data-localization). The reviewer verified the holder name and last-4 against the customer's declared value.
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {r.document && (
                              <Button variant="ghost" size="sm" onClick={() => viewDoc(r.document!.file_path)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            {canReview && (
                              <>
                                <Button variant="outline" size="sm" className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                                  onClick={() => setReviewing({ row: r, mode: "approve" })}>
                                  <Check className="h-4 w-4 mr-1" /> Approve
                                </Button>
                                <Button variant="outline" size="sm" className="text-red-700 border-red-300 hover:bg-red-50"
                                  onClick={() => { setReason(""); setReviewing({ row: r, mode: "reject" }); }}>
                                  <X className="h-4 w-4 mr-1" /> Reject
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!reviewing} onOpenChange={(o) => { if (!o) { setReviewing(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewing?.mode === "approve" ? "Approve KYC" : "Reject KYC"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-muted-foreground">Customer</div>
              <div className="font-medium">
                {reviewing?.row.account.primary_contact_name || reviewing?.row.account.company_name}
              </div>
            </div>
            {reviewing?.row.ai_review && (
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" /> AI analysis
                  <AiRecommendationBadge ai={reviewing.row.ai_review} />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="text-muted-foreground">Extracted name</div>
                  <div className="font-medium">{reviewing.row.ai_review.extracted_holder_name || "—"}</div>
                  <div className="text-muted-foreground">Expected name</div>
                  <div>{reviewing.row.ai_review.expected_name || "—"}</div>
                  <div className="text-muted-foreground">Name match score</div>
                  <div>
                    {reviewing.row.ai_review.name_match_score != null
                      ? `${(reviewing.row.ai_review.name_match_score * 100).toFixed(0)}%`
                      : "—"}
                  </div>
                  <div className="text-muted-foreground">AI confidence</div>
                  <div>
                    {reviewing.row.ai_review.ai_confidence != null
                      ? `${(reviewing.row.ai_review.ai_confidence * 100).toFixed(0)}%`
                      : "—"}
                  </div>
                  <div className="text-muted-foreground">Extracted type</div>
                  <div>{reviewing.row.ai_review.extracted_doc_type || "—"}
                    {reviewing.row.ai_review.type_match === false && (
                      <span className="ml-1 text-red-700">(mismatch)</span>
                    )}
                  </div>
                  <div className="text-muted-foreground">Extracted number</div>
                  <div className="font-mono">{reviewing.row.ai_review.extracted_number_masked || "—"}
                    {reviewing.row.ai_review.number_match === false && (
                      <span className="ml-1 text-red-700 font-sans">(mismatch)</span>
                    )}
                  </div>
                  <div className="text-muted-foreground">Legibility</div>
                  <div>{reviewing.row.ai_review.legibility || "—"}</div>
                </div>
                {reviewing.row.ai_review.flags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {reviewing.row.ai_review.flags.map((f) => (
                      <Badge key={f} variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-[10px]">
                        {f.split("_").join(" ")}
                      </Badge>
                    ))}
                  </div>
                )}
                {reviewing.row.ai_review.error && (
                  <div className="text-xs text-red-700">AI error: {reviewing.row.ai_review.error}</div>
                )}
              </div>
            )}
            {reviewing && !reviewing.row.ai_review && reviewing.row.document?.doc_type === "aadhaar" && (
              <div className="rounded-md border bg-slate-50 p-3 text-xs text-slate-700">
                <div className="font-semibold uppercase tracking-wide text-[11px] text-slate-500 mb-1">
                  AI analysis
                </div>
                Manual review — AI is intentionally skipped for Aadhaar to keep the
                document off the external vision provider (data-localization).
                Please verify the holder name and last-4 against the customer's declared value.
              </div>
            )}
            {reviewing?.mode === "reject" && (
              <>
                <div className="space-y-2">
                  <Label>Reason category <span className="text-red-600">*</span></Label>
                  <Select value={reasonCategory} onValueChange={setReasonCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REJECT_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Additional notes {reasonCategory === "other" && <span className="text-red-600">*</span>}</Label>
                  <Textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                    placeholder="Optional context to help the customer resubmit correctly…" />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewing(null)} disabled={busy}>Cancel</Button>
            <Button
              onClick={confirm}
              disabled={busy || (reviewing?.mode === "reject" && reasonCategory === "other" && !reason.trim())}
              className={reviewing?.mode === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
              variant={reviewing?.mode === "reject" ? "destructive" : "default"}
            >
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {reviewing?.mode === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </main>
    </div>
  );
}