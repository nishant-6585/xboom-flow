import { useState, useMemo } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import AdminTabsNav from "@/components/admin/AdminTabsNav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Loader2, RefreshCw, Search, Trash2, Link2, Building2, AlertTriangle } from "lucide-react";

interface SuspectCompany {
  id: string;
  name: string;
  reason: string;
  created_at: string;
  created_by_name: string | null;
  total_orders_count: number | null;
  prospects_count: number;
  pipeline_count: number;
  orders_count: number;
  contacts_count: number;
  activities_count: number;
}

export default function CompanyCleanup() {
  const { user, isApproved, roles, loading } = useAuth();
  const isAdmin = (roles as string[] | undefined)?.includes("admin") ?? false;
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [relinkOpen, setRelinkOpen] = useState(false);
  const [relinkSearch, setRelinkSearch] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);

  const { data: suspects = [], isFetching, refetch } = useQuery({
    queryKey: ["suspect-companies"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("scan_suspect_companies");
      if (error) throw error;
      return (data || []) as SuspectCompany[];
    },
    enabled: !!user && !!isAdmin,
  });

  const { data: targetMatches = [] } = useQuery({
    queryKey: ["companies-search", relinkSearch],
    queryFn: async () => {
      const term = relinkSearch.trim();
      let q = supabase.from("companies").select("id,name,total_orders_count,city").order("name").limit(25);
      if (term) q = q.ilike("name", `%${term}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: relinkOpen,
  });

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return suspects;
    return suspects.filter(
      (s) => s.name.toLowerCase().includes(t) || s.reason.toLowerCase().includes(t),
    );
  }, [suspects, search]);

  const allSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id));
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      const next = new Set(selected);
      filtered.forEach((s) => next.delete(s.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      filtered.forEach((s) => next.add(s.id));
      setSelected(next);
    }
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const deleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase.rpc("bulk_delete_companies", {
        _ids: ids,
        _unlink_first: true,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (res) => {
      toast({
        title: "Deleted",
        description: `Removed ${res?.deleted_companies ?? 0} companies. Unlinked ${res?.unlinked_prospects ?? 0} prospects, ${res?.unlinked_pipeline_orders ?? 0} pipeline, ${res?.unlinked_orders ?? 0} orders.`,
      });
      setSelected(new Set());
      setConfirmDeleteOpen(false);
      qc.invalidateQueries({ queryKey: ["suspect-companies"] });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const relinkMut = useMutation({
    mutationFn: async ({ ids, target }: { ids: string[]; target: string }) => {
      const { data, error } = await supabase.rpc("relink_companies", {
        _source_ids: ids,
        _target_id: target,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (res) => {
      toast({
        title: "Relinked",
        description: `Moved ${res?.moved_prospects ?? 0} prospects, ${res?.moved_pipeline_orders ?? 0} pipeline, ${res?.moved_orders ?? 0} orders, ${res?.moved_contacts ?? 0} contacts, ${res?.moved_activities ?? 0} activities to target company.`,
      });
      setRelinkOpen(false);
      setTargetId(null);
      qc.invalidateQueries({ queryKey: ["suspect-companies"] });
    },
    onError: (e: any) => toast({ title: "Relink failed", description: e.message, variant: "destructive" }),
  });

  if (loading) return null;
  if (!user || !isApproved) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  const selectedIds = Array.from(selected);
  const selectedRows = suspects.filter((s) => selected.has(s.id));
  const totalLinked = selectedRows.reduce(
    (sum, r) => sum + r.prospects_count + r.pipeline_count + r.orders_count,
    0,
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <AdminTabsNav active="company-cleanup" />
      <main className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="w-6 h-6" /> Company Cleanup
            </h1>
            <p className="text-sm text-muted-foreground">
              Find and clean up companies that look like product names or junk values.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Suspect Companies</CardTitle>
              <CardDescription>
                {isFetching ? "Scanning…" : `${suspects.length} companies flagged. Select rows to delete or relink.`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filter…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 w-56"
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span className="ml-2">Rescan</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {selected.size > 0 && (
              <div className="flex items-center justify-between mb-3 p-3 rounded-md border bg-muted/40">
                <div className="text-sm">
                  <strong>{selected.size}</strong> selected · <strong>{totalLinked}</strong> linked records (prospects + pipeline + orders)
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setRelinkOpen(true)}>
                    <Link2 className="w-4 h-4 mr-2" /> Relink to…
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setConfirmDeleteOpen(true)}>
                    <Trash2 className="w-4 h-4 mr-2" /> Delete selected
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                    Clear
                  </Button>
                </div>
              </div>
            )}

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? "indeterminate" : false}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Prospects</TableHead>
                    <TableHead className="text-right">Pipeline</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Contacts</TableHead>
                    <TableHead className="text-right">Activities</TableHead>
                    <TableHead>Created by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isFetching && filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12">
                        <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Scanning companies…
                      </TableCell>
                    </TableRow>
                  )}
                  {!isFetching && filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                        No suspect companies found. 🎉
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map((row) => (
                    <TableRow key={row.id} data-state={selected.has(row.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(row.id)}
                          onCheckedChange={() => toggleOne(row.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{row.reason}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{row.prospects_count}</TableCell>
                      <TableCell className="text-right">{row.pipeline_count}</TableCell>
                      <TableCell className="text-right">{row.orders_count}</TableCell>
                      <TableCell className="text-right">{row.contacts_count}</TableCell>
                      <TableCell className="text-right">{row.activities_count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.created_by_name || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Delete confirmation */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Delete {selectedIds.length} companies?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected companies. Linked prospects, pipeline orders, and orders will be unlinked (set to no company) so the records themselves stay intact. Their contacts and activities will be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMut.mutate(selectedIds)}
              disabled={deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Delete {selectedIds.length}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Relink dialog */}
      <Dialog open={relinkOpen} onOpenChange={(v) => { setRelinkOpen(v); if (!v) setTargetId(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Relink {selectedIds.length} companies to a target</DialogTitle>
            <DialogDescription>
              Move every prospect, pipeline order, order, contact and activity from the selected companies onto the target company. The source companies stay (delete them after if you wish).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              placeholder="Search target company by name…"
              value={relinkSearch}
              onChange={(e) => setRelinkSearch(e.target.value)}
            />
            <div className="border rounded-md max-h-64 overflow-y-auto">
              {targetMatches.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">No matches</div>
              ) : (
                targetMatches.map((c: any) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setTargetId(c.id)}
                    className={`w-full text-left px-3 py-2 hover:bg-accent border-b last:border-b-0 flex items-center justify-between ${targetId === c.id ? "bg-accent" : ""}`}
                  >
                    <div>
                      <div className="font-medium text-sm">{c.name}</div>
                      {c.city && <div className="text-xs text-muted-foreground">{c.city}</div>}
                    </div>
                    <Badge variant="secondary">{c.total_orders_count ?? 0} orders</Badge>
                  </button>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRelinkOpen(false)} disabled={relinkMut.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => targetId && relinkMut.mutate({ ids: selectedIds, target: targetId })}
              disabled={!targetId || relinkMut.isPending}
            >
              {relinkMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Relink
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}