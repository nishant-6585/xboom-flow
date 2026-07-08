import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useKycQueue, kycStatusMeta, type KycQueueRow } from "@/hooks/useKyc";
import { format } from "date-fns";
import { Eye, Check, X, Loader2, ShieldCheck, Search } from "lucide-react";
import { Header } from "@/components/Header";

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

export default function KycVerification() {
  const { rows, loading, review, getSignedUrl, getAadhaarFull } = useKycQueue();
  const [params] = useSearchParams();
  const focusAccount = params.get("account");
  const [search, setSearch] = useState("");
  const [reviewing, setReviewing] = useState<{ row: KycQueueRow; mode: "approve" | "reject" } | null>(null);
  const [reason, setReason] = useState("");
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
    const ok = await review(
      reviewing.row.account.id,
      reviewing.row.document.id,
      reviewing.mode,
      reviewing.mode === "reject" ? reason : undefined,
    );
    setBusy(false);
    if (ok) { setReviewing(null); setReason(""); }
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <Header />
      <main className="container mx-auto px-4 py-6 max-w-7xl space-y-6 flex-1">
        <div className="flex items-center gap-3">
        <ShieldCheck className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">KYC Verification Queue</h1>
          <p className="text-sm text-muted-foreground">Review customer-submitted Aadhaar documents.</p>
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
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const meta = kycStatusMeta(r.account.kyc_status);
                    const canReview = r.account.kyc_status === "pending_verification" && r.document;
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
                            (r.document?.metadata as any)?.document_reference || "—"
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.account.kyc_submitted_at ? format(new Date(r.account.kyc_submitted_at), "dd MMM, HH:mm") : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{r.rep_name || "—"}</TableCell>
                        <TableCell><Badge variant="outline" className={meta.className}>{meta.label}</Badge></TableCell>
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
            {reviewing?.mode === "reject" && (
              <div className="space-y-2">
                <Label htmlFor="reason">Rejection reason <span className="text-red-600">*</span></Label>
                <Textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Document is blurry, name doesn't match…" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewing(null)} disabled={busy}>Cancel</Button>
            <Button
              onClick={confirm}
              disabled={busy || (reviewing?.mode === "reject" && !reason.trim())}
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