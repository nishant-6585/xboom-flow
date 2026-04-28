import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Download, Pencil } from "lucide-react";
import { format } from "date-fns";

type Status = "submitted" | "screening" | "shortlisted" | "rejected" | "hired";

interface Referral {
  id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string;
  resume_url: string | null;
  role_id: string;
  referred_by: string;
  status: Status;
  notes: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<Status, string> = {
  submitted: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  screening: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  shortlisted: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  rejected: "bg-red-500/10 text-red-700 dark:text-red-300",
  hired: "bg-green-500/10 text-green-700 dark:text-green-300",
};

export function ReferralsPanel() {
  const { role } = useAuth();
  const isHROrAdmin = role === "admin" || role === "hr";

  const [items, setItems] = useState<Referral[]>([]);
  const [roles, setRoles] = useState<{ id: string; title: string }[]>([]);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterReferrer, setFilterReferrer] = useState<string>("all");

  const [editing, setEditing] = useState<Referral | null>(null);
  const [editStatus, setEditStatus] = useState<Status>("submitted");
  const [editNotes, setEditNotes] = useState("");

  const load = async () => {
    setLoading(true);
    const [refRes, roleRes] = await Promise.all([
      supabase.from("referrals").select("*").order("created_at", { ascending: false }),
      supabase.from("hiring_requirements").select("id,title").order("title"),
    ]);
    if (refRes.error) toast.error(refRes.error.message);
    if (roleRes.error) toast.error(roleRes.error.message);
    const refs = (refRes.data ?? []) as Referral[];
    setItems(refs);
    setRoles((roleRes.data ?? []) as { id: string; title: string }[]);

    const ids = Array.from(new Set(refs.map(r => r.referred_by)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = p.full_name ?? "Unknown"; });
      setPeople(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => items.filter(r =>
    (filterRole === "all" || r.role_id === filterRole) &&
    (filterStatus === "all" || r.status === filterStatus) &&
    (filterReferrer === "all" || r.referred_by === filterReferrer)
  ), [items, filterRole, filterStatus, filterReferrer]);

  const referrers = useMemo(() => {
    const set = new Map<string, string>();
    items.forEach(r => set.set(r.referred_by, people[r.referred_by] ?? "Unknown"));
    return Array.from(set.entries());
  }, [items, people]);

  const downloadResume = async (r: Referral) => {
    if (!r.resume_url) return toast.error("No resume on file");
    const { data, error } = await supabase.storage
      .from("referral-resumes")
      .createSignedUrl(r.resume_url, 60 * 5);
    if (error || !data?.signedUrl) return toast.error(error?.message ?? "Cannot generate link");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const startEdit = (r: Referral) => {
    setEditing(r);
    setEditStatus(r.status);
    setEditNotes(r.notes ?? "");
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { error } = await supabase
      .from("referrals")
      .update({ status: editStatus, notes: editNotes || null })
      .eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Referral updated");
    setEditing(null);
    load();
  };

  const roleTitle = (id: string) => roles.find(r => r.id === id)?.title ?? "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{isHROrAdmin ? "All Referrals" : "My Referrals"}</h2>
          <p className="text-sm text-muted-foreground">
            {isHROrAdmin ? "Manage employee-referred candidates" : "Track the candidates you referred"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="screening">Screening</SelectItem>
              <SelectItem value="shortlisted">Shortlisted</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="hired">Hired</SelectItem>
            </SelectContent>
          </Select>
          {isHROrAdmin && (
            <Select value={filterReferrer} onValueChange={setFilterReferrer}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Referrer" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Referrers</SelectItem>
                {referrers.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-6 space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">No referrals found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Role</TableHead>
                  {isHROrAdmin && <TableHead>Referred By</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.candidate_name}</TableCell>
                    <TableCell className="text-xs">
                      <div>{r.candidate_email}</div>
                      <div className="text-muted-foreground">{r.candidate_phone}</div>
                    </TableCell>
                    <TableCell>{roleTitle(r.role_id)}</TableCell>
                    {isHROrAdmin && <TableCell>{people[r.referred_by] ?? "—"}</TableCell>}
                    <TableCell>
                      <Badge className={STATUS_COLORS[r.status]} variant="secondary">
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{format(new Date(r.created_at), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-right space-x-1">
                      {r.resume_url && (
                        <Button size="sm" variant="ghost" onClick={() => downloadResume(r)}>
                          <Download className="h-3 w-3" />
                        </Button>
                      )}
                      {isHROrAdmin && (
                        <Button size="sm" variant="ghost" onClick={() => startEdit(r)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Update Referral</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm">
              <div><b>{editing?.candidate_name}</b></div>
              <div className="text-muted-foreground">{editing && roleTitle(editing.role_id)}</div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={(v: Status) => setEditStatus(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="screening">Screening</SelectItem>
                  <SelectItem value="shortlisted">Shortlisted</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="hired">Hired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={4} value={editNotes} onChange={e => setEditNotes(e.target.value)} maxLength={2000} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}