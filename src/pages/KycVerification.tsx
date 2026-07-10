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
import { format } from "date-fns";
import { Eye, Check, X, Loader2, ShieldCheck, Search, Sparkles } from "lucide-react";
import { Header } from "@/components/Header";

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

export default function KycVerification() {
  const { rows, loading, review, getSignedUrl, getAadhaarFull } = useKycQueue();
  const [params] = useSearchParams();
  const focusAccount = params.get("account");
  const [search, setSearch] = useState("");
  const [reviewing, setReviewing] = useState<{ row: KycQueueRow; mode: "approve" | "reject" } | null>(null);
  const [reason, setReason] = useState("");
  const [reasonCategory, setReasonCategory] = useState<string>("document_unclear");
  const [busy, setBusy] = useState(false);
  const [aadhaarMap, setAadhaarMap] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter((r) =>
        [r.account.company_name, r.account.primary_contact_name, r.latest_order_number, r.customer_email, r.rep_name]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q)),
      );
    }
    if (focusAccount) list = [...list].sort((a, b) => (a.account.id === focusAccount ? -1 : b.account.id === focusAccount ? 1 : 0));
    return list;
  }, [rows, search, focusAccount]);

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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">{filtered.length} {filtered.length === 1 ? "account" : "accounts"}</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search customer, order…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
                  <TableRow>
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
                          <div className="flex flex-col gap-1 items-start">
                            <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                            {isDlMismatch && (
                              <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-[10px]">
                                DigiLocker · name mismatch
                              </Badge>
                            )}
                            {r.ai_review && effectiveStatus === "pending_verification" && (
                              <AiRecommendationBadge ai={r.ai_review} />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs align-top max-w-[220px]">
                          {effectiveStatus === "approved" || effectiveStatus === "rejected" ? (
                            <div className="flex flex-col gap-0.5">
                              {r.document?.reviewed_by ? (
                                <span className="font-medium">{r.reviewer_name || "Staff"}</span>
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
                        {f.replaceAll("_", " ")}
                      </Badge>
                    ))}
                  </div>
                )}
                {reviewing.row.ai_review.error && (
                  <div className="text-xs text-red-700">AI error: {reviewing.row.ai_review.error}</div>
                )}
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