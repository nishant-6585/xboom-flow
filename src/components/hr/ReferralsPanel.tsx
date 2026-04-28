import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { toast } from "sonner";
import { Download, Search, Users } from "lucide-react";

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
  const isHROrAdmin = role === "admin" || role === "hr";
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [referrerNames, setReferrerNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

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
    toast.success(
      status === "shortlisted"
        ? "Marked shortlisted — candidate added to Candidates module"
        : "Status updated"
    );
    load();
  };

  const downloadResume = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("hr-documents")
      .createSignedUrl(path, 60 * 5);
    if (error || !data) {
      toast.error(error?.message || "Could not generate link");
      return;
    }
    window.open(data.signedUrl, "_blank");
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
                        {r.resume_url && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadResume(r.resume_url!)}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        )}
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
    </div>
  );
}