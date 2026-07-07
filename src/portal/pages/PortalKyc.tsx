import { useEffect, useState } from "react";
import { PortalLayout } from "@/portal/components/PortalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useMyKyc, kycStatusMeta } from "@/hooks/useKyc";
import { Upload, FileText, Loader2, AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function PortalKyc() {
  const { account, documents, loading, submitting, submitAadhaar, getSignedUrl } = useMyKyc();
  const [aadhaar, setAadhaar] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [digilockerEnabled, setDigilockerEnabled] = useState(false);
  const [dlStarting, setDlStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("feature_flags")
        .select("enabled")
        .eq("key", "digilocker_kyc_enabled")
        .maybeSingle();
      if (!cancelled) setDigilockerEnabled(!!(data as any)?.enabled);
    })();
    return () => { cancelled = true; };
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

  async function handleSubmit() {
    if (!file) return;
    const ok = await submitAadhaar(aadhaar, file);
    if (ok) { setAadhaar(""); setFile(null); }
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
            Verify your identity with your Aadhaar card so we can process orders smoothly.
          </p>
        </div>

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
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {status === "not_submitted" ? "Submit Aadhaar" : "Re-upload Aadhaar"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {digilockerEnabled && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="h-5 w-5 text-primary mt-0.5" />
                    <div className="text-sm">
                      <div className="font-medium">Verify instantly with DigiLocker</div>
                      <div className="text-muted-foreground">
                        Fetches your Aadhaar securely from the Government's DigiLocker — no upload,
                        approved in seconds.
                      </div>
                    </div>
                  </div>
                  <Button onClick={startDigilocker} disabled={dlStarting} className="w-full sm:w-auto">
                    {dlStarting
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Redirecting…</>
                      : <><ShieldCheck className="h-4 w-4 mr-2" /> Verify with DigiLocker</>}
                  </Button>
                  <div className="text-xs text-muted-foreground">
                    Prefer to upload manually? Use the form below.
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="aadhaar">Aadhaar Number <span className="text-red-600">*</span></Label>
                <Input
                  id="aadhaar"
                  inputMode="numeric"
                  maxLength={14}
                  placeholder="XXXX XXXX XXXX"
                  value={aadhaar}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 12);
                    const fmt = v.replace(/(\d{4})(?=\d)/g, "$1 ");
                    setAadhaar(fmt);
                  }}
                />
                <p className="text-xs text-muted-foreground">12 digits, numeric only.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="file">Aadhaar document <span className="text-red-600">*</span></Label>
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
                disabled={submitting || !file || aadhaar.replace(/\s/g, "").length !== 12}
                className="w-full sm:w-auto"
              >
                {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</> : <><Upload className="h-4 w-4 mr-2" /> Submit for verification</>}
              </Button>
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