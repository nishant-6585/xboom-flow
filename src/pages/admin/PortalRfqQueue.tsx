import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import AdminTabsNav from "@/components/admin/AdminTabsNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, FileQuestion, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { signedAttachmentUrl } from "@/portal/lib/portalUploads";

type RfqStatus = "open" | "in_quote" | "converted" | "closed";

interface RfqRow {
  id: string;
  rfq_number: string;
  account_id: string;
  domains: string[];
  use_case: string;
  desired_date: string | null;
  budget_range: string | null;
  daas_interest: string | null;
  status: RfqStatus;
  assigned_rep_id: string | null;
  converted_to_order_id: string | null;
  attachments: { name: string; path: string; size?: number }[];
  created_at: string;
  account?: { company_name: string } | null;
}

const STATUS_LABEL: Record<RfqStatus, string> = {
  open: "Open",
  in_quote: "In quote",
  converted: "Converted",
  closed: "Closed",
};

const STATUS_TONE: Record<RfqStatus, string> = {
  open: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  in_quote: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  converted: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  closed: "bg-muted text-muted-foreground border-border",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function PortalRfqQueue() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"all" | RfqStatus>("all");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [selected, setSelected] = useState<RfqRow | null>(null);

  const canAccess =
    role === "admin" ||
    role === "supply_chain" ||
    role === "sales" ||
    role === "sales_manager";

  const { data: rfqs, isLoading } = useQuery({
    queryKey: ["admin", "portal-rfqs"],
    enabled: canAccess,
    queryFn: async (): Promise<RfqRow[]> => {
      const { data, error } = await supabase
        .from("portal_rfqs")
        .select(
          "id, rfq_number, account_id, domains, use_case, desired_date, budget_range, daas_interest, status, assigned_rep_id, converted_to_order_id, attachments, created_at, account:portal_accounts(company_name)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown) as RfqRow[];
    },
  });

  const filtered = useMemo(() => {
    let out = rfqs ?? [];
    if (statusFilter !== "all") out = out.filter((r) => r.status === statusFilter);
    if (scope === "mine" && user?.id)
      out = out.filter((r) => r.assigned_rep_id === user.id);
    return out;
  }, [rfqs, statusFilter, scope, user?.id]);

  const updateRfq = useMutation({
    mutationFn: async (patch: { id: string; updates: Partial<RfqRow> }) => {
      const { error } = await supabase
        .from("portal_rfqs")
        .update(patch.updates as never)
        .eq("id", patch.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "portal-rfqs"] });
    },
  });

  const convertToDraftOrder = useMutation({
    mutationFn: async (rfq: RfqRow) => {
      const { data: order, error: e1 } = await supabase
        .from("portal_orders")
        .insert({
          account_id: rfq.account_id,
          assigned_rep_id: rfq.assigned_rep_id ?? user?.id ?? null,
          current_state: "draft",
          portal_visible: false,
          delivery_commitment: rfq.desired_date
            ? `Customer requested by ${rfq.desired_date}`
            : null,
        } as never)
        .select("id, order_number")
        .single();
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("portal_rfqs")
        .update({
          status: "converted",
          converted_to_order_id: (order as { id: string }).id,
        } as never)
        .eq("id", rfq.id);
      if (e2) throw e2;
      return order as { id: string; order_number: string };
    },
    onSuccess: (order) => {
      toast.success(`Draft order ${order.order_number} created`);
      qc.invalidateQueries({ queryKey: ["admin", "portal-rfqs"] });
      setSelected(null);
    },
    onError: (err: Error) =>
      toast.error(err.message || "Couldn't convert RFQ"),
  });

  if (!canAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Access restricted to sales / supply chain staff.
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <AdminTabsNav active="portal-rfqs" />
      <div className="container mx-auto px-4 sm:px-6 py-6 max-w-6xl">
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Portal RFQ Queue</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Customer-submitted requests. Assign, quote, or convert into a draft order.
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reps</SelectItem>
                <SelectItem value="mine">Assigned to me</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_quote">In quote</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <Card>
            <CardContent className="py-14 flex flex-col items-center text-center">
              <FileQuestion className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium">No RFQs match these filters</p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {filtered.map((r) => (
            <Card
              key={r.id}
              className="cursor-pointer hover:border-primary/40 transition"
              onClick={() => setSelected(r)}
            >
              <CardContent className="py-4 px-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{r.rfq_number}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_TONE[r.status]}`}
                      >
                        {STATUS_LABEL[r.status]}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {r.account?.company_name ?? "—"}
                      </Badge>
                      {r.assigned_rep_id === user?.id && (
                        <Badge className="text-xs">Mine</Badge>
                      )}
                    </div>
                    <p className="text-sm mt-2 line-clamp-2 text-muted-foreground">
                      {r.use_case}
                    </p>
                    <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {r.domains.length > 0 && <span>{r.domains.join(" · ")}</span>}
                      {r.budget_range && <span>Budget: {r.budget_range}</span>}
                      {r.desired_date && <span>Wants by {fmtDate(r.desired_date)}</span>}
                      <span>Submitted {fmtDate(r.created_at)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selected?.rfq_number} — {selected?.account?.company_name ?? "—"}
              </DialogTitle>
            </DialogHeader>
            {selected && (
              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_TONE[selected.status]}`}
                  >
                    {STATUS_LABEL[selected.status]}
                  </span>
                  {selected.assigned_rep_id === user?.id && (
                    <Badge className="text-xs">Assigned to me</Badge>
                  )}
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Use case</p>
                  <p className="whitespace-pre-wrap">{selected.use_case}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Domains</p>
                    <p>{selected.domains.join(", ") || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Budget</p>
                    <p>{selected.budget_range || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Desired by</p>
                    <p>{fmtDate(selected.desired_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Buy / DaaS</p>
                    <p>{selected.daas_interest || "—"}</p>
                  </div>
                </div>

                {selected.attachments?.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Attachments</p>
                    <div className="space-y-1">
                      {selected.attachments.map((a) => (
                        <button
                          key={a.path}
                          className="text-primary hover:underline flex items-center gap-1.5"
                          onClick={async () => {
                            try {
                              const url = await signedAttachmentUrl(a.path);
                              window.open(url, "_blank");
                            } catch (e) {
                              toast.error(
                                e instanceof Error ? e.message : "Couldn't open file",
                              );
                            }
                          }}
                        >
                          <ExternalLink className="h-3 w-3" /> {a.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selected.converted_to_order_id && (
                  <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
                    Converted to draft order.
                    <Button
                      variant="link"
                      className="h-auto p-0 ml-2 text-xs"
                      onClick={() =>
                        navigate(
                          `/admin/portal-orders/${selected.converted_to_order_id}`,
                        )
                      }
                    >
                      Open order
                    </Button>
                  </div>
                )}
              </div>
            )}
            <DialogFooter className="flex-wrap gap-2">
              {selected && selected.status !== "converted" && (
                <>
                  {selected.assigned_rep_id !== user?.id && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        updateRfq.mutate({
                          id: selected.id,
                          updates: { assigned_rep_id: user?.id ?? null },
                        })
                      }
                      disabled={updateRfq.isPending}
                    >
                      Assign to me
                    </Button>
                  )}
                  {selected.status === "open" && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        updateRfq.mutate({
                          id: selected.id,
                          updates: { status: "in_quote" },
                        })
                      }
                      disabled={updateRfq.isPending}
                    >
                      Mark in quote
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() =>
                      updateRfq.mutate({
                        id: selected.id,
                        updates: { status: "closed" },
                      })
                    }
                    disabled={updateRfq.isPending}
                  >
                    Close
                  </Button>
                  <Button
                    onClick={() => convertToDraftOrder.mutate(selected)}
                    disabled={convertToDraftOrder.isPending}
                  >
                    {convertToDraftOrder.isPending && (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    )}
                    Convert to draft order
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}