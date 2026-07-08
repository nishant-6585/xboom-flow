import { useEffect, useMemo, useRef, useState } from "react";
import { PortalLayout } from "@/portal/components/PortalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useMyKyc, kycStatusMeta } from "@/hooks/useKyc";
import { Upload, FileText, Loader2, AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type DocType =
  | "aadhaar" | "pan" | "driving_license" | "voter_id"
  | "passport" | "rental_agreement" | "other_gov_id";

const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: "aadhaar", label: "Aadhaar Card" },
  { value: "pan", label: "PAN Card" },
  { value: "driving_license", label: "Driving Licence" },
  { value: "voter_id", label: "Voter ID" },
  { value: "passport", label: "Passport" },
  { value: "rental_agreement", label: "Rental Agreement (address proof)" },
  { value: "other_gov_id", label: "Other Govt-issued ID" },
];

function fieldConfig(t: DocType) {
  switch (t) {
    case "aadhaar":
      return { label: "Aadhaar Number", placeholder: "XXXX XXXX XXXX", required: true, hint: "12 digits, numeric only." };
    case "pan":
      return { label: "PAN Number", placeholder: "AAAAA9999A", required: true, hint: "Format: 5 letters, 4 digits, 1 letter." };
    case "driving_license":
      return { label: "Driving Licence Number", placeholder: "e.g. KA01 20230001234", required: true, hint: "As printed on the licence." };
    case "voter_id":
      return { label: "Voter ID (EPIC) Number", placeholder: "e.g. ABC1234567", required: true, hint: "As printed on the card." };
    case "passport":
      return { label: "Passport Number", placeholder: "e.g. M1234567", required: true, hint: "1 letter followed by 7 digits." };
    case "rental_agreement":
      return { label: "Document reference (optional)", placeholder: "Agreement number if any", required: false, hint: "Any reference or leave blank." };
    default:
      return { label: "Document reference (optional)", placeholder: "Any reference number", required: false, hint: "Optional." };
  }
}

function validateNumber(t: DocType, raw: string): string | null {
  const v = raw.trim();
  if (!v) {
    if (t === "rental_agreement" || t === "other_gov_id") return null;
    return "This field is required";
  }
  switch (t) {
    case "aadhaar":
      return /^\d{12}$/.test(v.replace(/\s+/g, "")) ? null : "Aadhaar must be exactly 12 digits";
    case "pan":
      return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v.toUpperCase()) ? null : "PAN must be in the format AAAAA9999A";
    case "driving_license":
      return /^[A-Z0-9\-\s]{5,20}$/i.test(v) ? null : "Driving Licence number looks invalid";
    case "passport":
      return /^[A-PR-WYa-pr-wy][0-9]{7}$/.test(v) ? null : "Passport must be 1 letter followed by 7 digits";
    case "voter_id":
      return /^[A-Z0-9]{6,20}$/i.test(v) ? null : "Voter ID looks invalid";
    default:
      return null;
  }
}

export default function PortalKyc() {
  const { account, documents, loading, submitting, submitDocument, getSignedUrl } = useMyKyc();
  const [docType, setDocType] = useState<DocType>("aadhaar");
  const [docNumber, setDocNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [digilockerVisible, setDigilockerVisible] = useState(false);
  const [dlStarting, setDlStarting] = useState(false);

  // Show DigiLocker banner about the redirect result, if any.
  const dlResult = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    const dl = p.get("dl");
    if (!dl) return null;
    return { status: dl, reason: p.get("reason") };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: flags } = await supabase
        .from("feature_flags")
        .select("key, enabled, metadata")
        .in("key", ["digilocker_kyc_enabled", "digilocker_kyc_test_emails"]);
      const map: Record<string, any> = {};
      for (const f of (flags as any[]) || []) map[f.key] = f;
      const globalOn = !!map["digilocker_kyc_enabled"]?.enabled;

      let allowlisted = false;
      const testFlag = map["digilocker_kyc_test_emails"];
      if (testFlag?.enabled && Array.isArray(testFlag?.metadata)) {
        const { data: u } = await supabase.auth.getUser();
        const email = String(u.user?.email || "").toLowerCase();
        allowlisted = (testFlag.metadata as string[])
          .map((e) => String(e).toLowerCase()).includes(email);
      }
      if (!cancelled) setDigilockerVisible(globalOn || allowlisted);
    })();
    return () => { cancelled = true; };
  }, []);

  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  async function startDigilocker() {
    setDlStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke("digilocker-initiate", { body: {} });
      if (error) throw error;
      const url = (data as any)?.consent_url;
      if (!url) throw new Error("No consent URL returned");
      window.location.href = url;
    } catch (e: any) {
      toast.error(e.message ?? "Could not start DigiLocker verification");
      setDlStarting(false);
    }
  }

  if (loading) {
    return <PortalLayout><div className="p-10 text-center text-muted-foreground">Loading…</div></PortalLayout>;
  }

  const status = account?.kyc_status ?? "not_submitted";
  const meta = kycStatusMeta(status);
  const canSubmit =
    status === "not_submitted" || status === "rejected" || status === "resubmission_required";
  const currentDoc = documents.find((d) => d.is_current) ?? documents[0] ?? null;

  const cfg = fieldConfig(docType);
  const numberError = validateNumber(docType, docNumber);
  const canSend = !!file && !numberError && (!cfg.required || docNumber.trim().length > 0);

  async function handleSubmit() {
    if (!file || !canSend) return;
    const ok = await submitDocument({
      documentType: docType,
      documentNumber: docNumber.trim(),
      file,
    });
    if (ok) { setDocNumber(""); setFile(null); }
  }

  async function viewDoc(path: string) {
    try { window.open(await getSignedUrl(path), "_blank"); } catch {}
  }

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">KYC Verification</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verify your identity with a government-issued ID so we can process your orders.
          </p>
        </div>

        {dlResult && (
          <div
            className={
              "p-3 border rounded-md text-sm " +
              (dlResult.status === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : dlResult.status === "mismatch"
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-red-50 border-red-200 text-red-800")
            }
          >
            {dlResult.status === "success" && "DigiLocker verification successful — your KYC is approved."}
            {dlResult.status === "mismatch" && "We received your DigiLocker document but the name doesn't match your account. Our team will review it shortly."}
            {dlResult.status === "denied" &&
              "DigiLocker did not release your Driving Licence or PAN. Please make sure one of them is issued in your DigiLocker, or upload manually below."}
            {dlResult.status === "failure" && `DigiLocker verification failed${dlResult.reason ? ` (${dlResult.reason})` : ""}. Please try again or upload manually.`}
          </div>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Current status</CardTitle>
            <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {account?.aadhaar_last4 && (
              <div><span className="text-muted-foreground">Aadhaar on file:</span> <span className="font-mono">XXXX XXXX {account.aadhaar_last4}</span></div>
            )}
            {account?.kyc_submitted_at && (
              <div><span className="text-muted-foreground">Submitted:</span> {format(new Date(account.kyc_submitted_at), "dd MMM yyyy, HH:mm")}</div>
            )}
            {account?.kyc_reviewed_at && (
              <div><span className="text-muted-foreground">Reviewed:</span> {format(new Date(account.kyc_reviewed_at), "dd MMM yyyy, HH:mm")}</div>
            )}
            {(status === "rejected" || status === "resubmission_required") && account?.kyc_rejection_reason && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-red-800">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div><div className="font-medium">Rejected — please resubmit</div><div className="text-sm mt-0.5">{account.kyc_rejection_reason}</div></div>
              </div>
            )}
            {status === "approved" && (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800">
                <CheckCircle2 className="h-4 w-4" /> Your KYC is approved — no further action needed.
              </div>
            )}
            {currentDoc && (
              <div className="pt-2 border-t">
                <div className="text-xs text-muted-foreground mb-1">Last upload</div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{currentDoc.file_name}</span>
                  <Button variant="link" size="sm" className="h-auto p-0 ml-auto" onClick={() => viewDoc(currentDoc.file_path)}>View</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {canSubmit && (
          digilockerVisible && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" /> Verify instantly with DigiLocker
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Use your Driving Licence or PAN from DigiLocker to verify in seconds — no manual upload needed.
                </p>
                <Button onClick={startDigilocker} disabled={dlStarting} className="w-full sm:w-auto">
                  {dlStarting
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Redirecting…</>
                    : <><ShieldCheck className="h-4 w-4 mr-2" /> Verify instantly with DigiLocker</>}
                </Button>
              </CardContent>
            </Card>
          )
        )}

        {canSubmit && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {status === "not_submitted" ? "Upload a document manually" : "Re-upload a document"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="doc-type">Document Type <span className="text-red-600">*</span></Label>
                <Select value={docType} onValueChange={(v) => { setDocType(v as DocType); setDocNumber(""); }}>
                  <SelectTrigger id="doc-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="doc-number">
                  {cfg.label}{cfg.required && <span className="text-red-600"> *</span>}
                </Label>
                <Input
                  id="doc-number"
                  inputMode={docType === "aadhaar" ? "numeric" : "text"}
                  placeholder={cfg.placeholder}
                  value={docNumber}
                  onChange={(e) => {
                    if (docType === "aadhaar") {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 12);
                      setDocNumber(v.replace(/(\d{4})(?=\d)/g, "$1 "));
                    } else {
                      setDocNumber(e.target.value.slice(0, 120));
                    }
                  }}
                />
                <p className={`text-xs ${numberError && docNumber ? "text-red-600" : "text-muted-foreground"}`}>
                  {numberError && docNumber ? numberError : cfg.hint}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="file">Document file <span className="text-red-600">*</span></Label>
                <Input
                  id="file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">PDF, JPG, JPEG, or PNG. Max 10MB.</p>
              </div>
              <Button
                onClick={handleSubmit}
                disabled={submitting || !canSend}
                className="w-full sm:w-auto"
              >
                {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</> : <><Upload className="h-4 w-4 mr-2" /> Submit for verification</>}
              </Button>
              <p className="text-xs text-muted-foreground">
                Manual uploads are reviewed by our team before approval.
              </p>
            </CardContent>
          </Card>
        )}

        {documents.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Upload history</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {documents.map((d) => {
                  const m = kycStatusMeta(d.status);
                  return (
                    <div key={d.id} className="flex items-center justify-between gap-3 p-3 border rounded-md text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{d.file_name}</div>
                          <div className="text-xs text-muted-foreground">v{d.version} · {format(new Date(d.uploaded_at), "dd MMM yyyy HH:mm")}</div>
                        </div>
                      </div>
                      <Badge variant="outline" className={`${m.className} text-xs shrink-0`}>{m.label}</Badge>
                      <Button variant="link" size="sm" className="shrink-0" onClick={() => viewDoc(d.file_path)}>View</Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PortalLayout>
  );
}