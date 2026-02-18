import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  UserPlus, Search, Filter, Trash2, Eye, Briefcase, MapPin, Users, TrendingUp, UserCheck, UserX
} from "lucide-react";
import { useCandidates, CandidateStatus, useCandidateMutations, Candidate } from "@/hooks/useCandidates";
import { CandidateStatusBadge } from "./CandidateStatusBadge";
import { CandidateFormDialog } from "./CandidateFormDialog";
import { CandidateDetailDialog } from "./CandidateDetailDialog";

const STATUSES: { value: CandidateStatus | "all"; label: string }[] = [
  { value: "all", label: "All Status" },
  { value: "applied", label: "Applied" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "rejected", label: "Rejected" },
  { value: "hired", label: "Hired" },
  { value: "blacklisted", label: "Blacklisted" },
];

export function CandidatesPanel() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CandidateStatus | "all">("all");
  const [minExp, setMinExp] = useState("");
  const [maxExp, setMaxExp] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editCandidate, setEditCandidate] = useState<Candidate | null>(null);
  const [detailCandidate, setDetailCandidate] = useState<Candidate | null>(null);

  const { candidates, isLoading } = useCandidates({
    search,
    status,
    minExperience: minExp ? Number(minExp) : undefined,
    maxExperience: maxExp ? Number(maxExp) : undefined,
  });

  const { deleteCandidate } = useCandidateMutations();

  const counts = {
    total: candidates.length,
    shortlisted: candidates.filter((c) => c.status === "shortlisted").length,
    hired: candidates.filter((c) => c.status === "hired").length,
    rejected: candidates.filter((c) => c.status === "rejected").length,
  };

  const statCards = [
    { label: "Total", value: counts.total, icon: Users, color: "text-blue-500" },
    { label: "Shortlisted", value: counts.shortlisted, icon: TrendingUp, color: "text-yellow-500" },
    { label: "Hired", value: counts.hired, icon: UserCheck, color: "text-green-500" },
    { label: "Rejected", value: counts.rejected, icon: UserX, color: "text-red-500" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Candidate Database</h2>
          <p className="text-sm text-muted-foreground">Manage all candidates — selected, rejected, and archived</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          Add Candidate
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map((card) => (
          <div key={card.label} className="p-3 rounded-xl border border-border bg-card space-y-1.5">
            <div className="flex items-center gap-2">
              <card.icon className={`w-4 h-4 ${card.color}`} />
              <span className="text-xs text-muted-foreground">{card.label}</span>
            </div>
            <p className="text-2xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name, email, company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-full sm:w-44">
            <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input type="number" placeholder="Min exp" min="0" className="w-24" value={minExp} onChange={(e) => setMinExp(e.target.value)} />
          <span className="text-muted-foreground text-sm">—</span>
          <Input type="number" placeholder="Max exp" min="0" className="w-24" value={maxExp} onChange={(e) => setMaxExp(e.target.value)} />
          <span className="text-xs text-muted-foreground">yrs</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        {isLoading ? (
          <div className="py-16 text-center text-muted-foreground">Loading candidates...</div>
        ) : candidates.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="font-medium">No candidates found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {search || status !== "all" ? "Try adjusting your filters" : "Add your first candidate to get started"}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead className="hidden sm:table-cell">Experience</TableHead>
                <TableHead className="hidden md:table-cell">Location</TableHead>
                <TableHead className="hidden lg:table-cell">CTC Range</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Skills</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setDetailCandidate(c)}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{c.full_name}</p>
                      <p className="text-xs text-muted-foreground">{c.email}</p>
                      {c.current_company && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Briefcase className="w-3 h-3" />{c.current_company}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {c.years_of_experience !== undefined && c.years_of_experience !== null
                      ? `${c.years_of_experience} yr${c.years_of_experience !== 1 ? "s" : ""}`
                      : "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {c.location ? (
                      <span className="flex items-center gap-1 text-sm">
                        <MapPin className="w-3 h-3" />{c.location}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="text-sm">
                      {c.current_ctc != null ? <span className="text-muted-foreground">₹{c.current_ctc}L</span> : null}
                      {c.current_ctc != null && c.expected_ctc != null ? <span className="text-muted-foreground"> → </span> : null}
                      {c.expected_ctc != null ? <span className="font-medium">₹{c.expected_ctc}L</span> : null}
                      {c.current_ctc == null && c.expected_ctc == null ? "—" : null}
                    </div>
                  </TableCell>
                  <TableCell><CandidateStatusBadge status={c.status} /></TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {c.primary_skills?.slice(0, 3).map((s) => (
                        <Badge key={s} variant="secondary" className="text-[10px] px-1.5 py-0">{s}</Badge>
                      ))}
                      {(c.primary_skills?.length || 0) > 3 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{c.primary_skills!.length - 3}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailCandidate(c)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Candidate?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete {c.full_name} and all associated documents and interview records.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => deleteCandidate.mutate(c.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{candidates.length} candidate{candidates.length !== 1 ? "s" : ""} shown</p>

      <CandidateFormDialog open={addOpen} onClose={() => setAddOpen(false)} />

      {editCandidate && (
        <CandidateFormDialog open={!!editCandidate} onClose={() => setEditCandidate(null)} candidate={editCandidate} />
      )}

      {detailCandidate && (
        <CandidateDetailDialog
          open={!!detailCandidate}
          onClose={() => setDetailCandidate(null)}
          candidate={detailCandidate}
          onEdit={() => { setEditCandidate(detailCandidate); setDetailCandidate(null); }}
        />
      )}
    </div>
  );
}
