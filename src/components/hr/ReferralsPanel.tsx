import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { Download, Search, Users, CheckCircle2, Copy, ExternalLink, Eye, FileText, FileX2 } from "lucide-react";
import {
  createHrDocumentSignedUrl,
  notifySignedUrlFailure,
  triggerDownload,
  isSupportedResume,
  getDocumentExt,
  type SignedUrlResult,
} from "@/lib/hrDocuments";

interface ReferralRow {
  id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string;
  status: string;
  notes: string | null;
  resume_url: string | null;
  referred_by: string;
  role_id: string;
  candidate_id: string | null;
  created_at: string;
  hiring_requirements?: { title: string | null } | null;
}

const STATUSES = [
  { value: "submitted", label: "Submitted" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "interviewing", label: "Interviewing" },
  { value: "hired", label: "Hired" },
  { value: "rejected", label: "Rejected" },
];

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (s) {
    case "hired":
      return "default";
    case "shortlisted":
    case "interviewing":
      return "secondary";
    case "rejected":
      return "destructive";
    default:
      return "outline";
  }
};

export function ReferralsPanel() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const isHROrAdmin = role === "admin" || role === "hr";
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [referrerNames, setReferrerNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [shortlistConfirm, setShortlistConfirm] = useState<{
    candidateId: string;
    candidateName: string;
  } | null>(null);
  const [viewer, setViewer] = useState<{
    url: string;
    name: string;
    ext: string;
    kind: "pdf" | "image" | "other";
  } | null>(null);

  // Cache: referralId -> { url, expiresAt } for signed URLs (refresh ~30s before expiry)
  const SIGNED_URL_TTL_SEC = 60 * 5;
  const SIGNED_URL_REFRESH_BEFORE_MS = 30 * 1000;
  const signedUrlCache = useRef<Map<string, { url: string; expiresAt: number; path: string }>>(
    new Map()
  );

  // Invalidate cache entries whose underlying path changed (e.g. after re-upload)
  useEffect(() => {
    const cache = signedUrlCache.current;
    for (const [refId, entry] of cache) {
      const row = rows.find((r) => r.id === refId);
      if (!row || row.resume_url !== entry.path) cache.delete(refId);
    }
  }, [rows]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("referrals")
      .select("*, hiring_requirements(title)")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const list = (data as ReferralRow[]) || [];
    setRows(list);

    const referrerIds = Array.from(new Set(list.map((r) => r.referred_by)));
    if (referrerIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", referrerIds);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: any) => (map[p.id] = p.full_name || ""));
      setReferrerNames(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("referrals").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }

    if (status === "shortlisted") {
      // Re-fetch the row to get the candidate_id populated by the DB trigger
      const { data: updated } = await supabase
        .from("referrals")
        .select("candidate_id, candidate_name")
        .eq("id", id)
        .maybeSingle();
      if (updated?.candidate_id) {
        setShortlistConfirm({
          candidateId: updated.candidate_id,
          candidateName: updated.candidate_name,
        });
      } else {
        toast.warning(
          "Marked shortlisted but candidate link is pending. Refresh in a moment."
        );
      }
    } else {
      toast.success("Status updated");
    }
    load();
  };

  /**
   * Resolve a signed URL for a referral resume, using the per-referral
   * cache when possible. Returns null on failure (toast already shown).
   */
  const resolveResumeUrl = async (
    path: string,
    referralId: string
  ): Promise<string | null> => {
    const cached = signedUrlCache.current.get(referralId);
    if (
      cached &&
      cached.path === path &&
      cached.expiresAt - Date.now() > SIGNED_URL_REFRESH_BEFORE_MS
    ) {
      return cached.url;
    }

    const result = await createHrDocumentSignedUrl(path, {
      ttlSeconds: SIGNED_URL_TTL_SEC,
      resumeOnly: true,
    });

    if (!result.ok) {
      notifySignedUrlFailure(result);
      return null;
    }
    // result is SignedUrlSuccess from here on

    signedUrlCache.current.set(referralId, {
      url: result.url,
      expiresAt: result.expiresAt,
      path: result.path,
    });
    return result.url;
  };

  const logAccess = async (
    referralId: string,
    path: string,
    action: "view" | "download"
  ) => {
    try {
      await (supabase as any).rpc("log_resume_access", {
        _referral_id: referralId,
        _document_path: path,
        _action: action,
        _user_agent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
      });
    } catch {
      // Non-blocking: audit failure should not prevent legitimate access
    }
  };

  const viewResume = async (
    path: string,
    candidateName: string,
    referralId: string
  ) => {
    const url = await resolveResumeUrl(path, referralId);
    if (!url) return;
    void logAccess(referralId, path, "view");
    const fileName = path.split("/").pop() || "resume";
    const ext = getDocumentExt(path);
    const kind: "pdf" | "image" | "other" = "pdf";
    setViewer({ url, name: `${candidateName} — ${fileName}`, ext, kind });
  };

  const downloadResume = async (path: string, referralId: string) => {
    const url = await resolveResumeUrl(path, referralId);
    if (!url) return;
    void logAccess(referralId, path, "download");
    triggerDownload(url, path.split("/").pop() || "resume");
  };

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.candidate_name.toLowerCase().includes(q) &&
          !r.candidate_email.toLowerCase().includes(q) &&
          !(r.hiring_requirements?.title || "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [rows, search, statusFilter]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Referrals</h2>
        <p className="text-sm text-muted-foreground">
          {isHROrAdmin
            ? "Manage candidate referrals from employees"
            : "Your referral submissions"}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="h-40 bg-muted rounded animate-pulse" />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No referrals yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Referred By</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.candidate_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.candidate_email}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.candidate_phone}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.hiring_requirements?.title || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {referrerNames[r.referred_by] || "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {format(new Date(r.created_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                      {r.candidate_id && (
                        <div className="text-[10px] text-muted-foreground mt-1">
                          Linked to Candidates
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {!r.resume_url ? (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground"
                            title="The candidate did not attach a resume to this referral"
                          >
                            <FileX2 className="h-3 w-3" />
                            No resume uploaded
                          </span>
                        ) : (() => {
                          const supported = isSupportedResume(r.resume_url);
                          const ext = getDocumentExt(r.resume_url);
                          const tip = supported
                            ? undefined
                            : `Unsupported format (.${ext || "?"}) — only PDF resumes are accepted`;
                          return (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                title={tip || "View resume"}
                                disabled={!supported}
                                onClick={() => viewResume(r.resume_url!, r.candidate_name, r.id)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                title={tip || "Download resume"}
                                disabled={!supported}
                                onClick={() => downloadResume(r.resume_url!, r.id)}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          );
                        })()}
                        {isHROrAdmin && (
                          <Select
                            value={r.status}
                            onValueChange={(v) => updateStatus(r.id, v)}
                          >
                            <SelectTrigger className="w-[140px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUSES.map((s) => (
                                <SelectItem key={s.value} value={s.value}>
                                  {s.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={!!shortlistConfirm}
        onOpenChange={(o) => !o && setShortlistConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Candidate added to Candidates module
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1">
                <p>
                  <span className="font-medium text-foreground">
                    {shortlistConfirm?.candidateName}
                  </span>{" "}
                  has been linked. You can now manage them from the Candidates
                  module.
                </p>
                <div className="rounded-md border bg-muted/40 p-2 flex items-center justify-between gap-2">
                  <code className="text-xs break-all">
                    {shortlistConfirm?.candidateId}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (shortlistConfirm) {
                        navigator.clipboard.writeText(shortlistConfirm.candidateId);
                        toast.success("Candidate ID copied");
                      }
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShortlistConfirm(null);
                navigate("/hr?tab=candidates");
              }}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Candidates
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewer} onOpenChange={(o) => !o && setViewer(null)}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b">
            <DialogTitle className="text-sm font-medium truncate pr-8">
              {viewer?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 bg-muted/30">
            {viewer?.kind === "pdf" && (
              <iframe
                src={viewer.url}
                title="Resume preview"
                className="w-full h-full border-0"
              />
            )}
            {viewer?.kind === "image" && (
              <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
                <img
                  src={viewer.url}
                  alt="Resume preview"
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            )}
            {viewer?.kind === "other" && (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                <FileText className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Preview not available for .{viewer.ext} files. Use the download
                  option below to open it locally.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="px-4 py-3 border-t flex-row sm:justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => viewer && window.open(viewer.url, "_blank", "noopener,noreferrer")}
              disabled={!viewer}
            >
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              Open in new tab
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!viewer) return;
                const a = document.createElement("a");
                a.href = viewer.url;
                a.download = viewer.name.split("—").pop()?.trim() || "resume";
                a.rel = "noopener noreferrer";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }}
              disabled={!viewer}
            >
              <Download className="mr-2 h-3.5 w-3.5" />
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}