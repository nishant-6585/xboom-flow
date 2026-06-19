import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Row {
  id: string;
  created_at: string;
  order_id: string | null;
  order_number: string | null;
  recipient_email: string | null;
  status: string;
  attempt_count: number | null;
  error: string | null;
  sent_by: string | null;
  doc_type: string | null;
}

const PAGE_SIZE = 25;

const STATUSES = [
  { value: "all", label: "All statuses" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
  { value: "skipped", label: "Skipped" },
  { value: "pending", label: "Pending" },
];

function statusBadge(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "sent") return <Badge className="bg-emerald-600 hover:bg-emerald-700">Sent</Badge>;
  if (s === "failed") return <Badge variant="destructive">Failed</Badge>;
  if (s === "skipped") return <Badge variant="secondary">Skipped</Badge>;
  return <Badge variant="outline">{status || "—"}</Badge>;
}

export default function KycEmailLogs() {
  const { role, loading: authLoading } = useAuth();
  const isAllowed =
    role === "admin" ||
    role === "sales" ||
    role === "sales_manager" ||
    role === "finance";

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  const [orderSearch, setOrderSearch] = useState("");
  const [emailSearch, setEmailSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [senderNames, setSenderNames] = useState<Record<string, string>>({});

  const fetchPage = async () => {
    setLoading(true);
    try {
      let q: any = (supabase.from("kyc_email_log") as any)
        .select(
          "id, created_at, order_id, order_number, recipient_email, status, attempt_count, error, sent_by, doc_type",
          { count: "exact" },
        )
        .order("created_at", { ascending: false });
      if (orderSearch.trim()) q = q.ilike("order_number", `%${orderSearch.trim()}%`);
      if (emailSearch.trim()) q = q.ilike("recipient_email", `%${emailSearch.trim()}%`);
      if (status !== "all") q = q.eq("status", status);
      if (from) q = q.gte("created_at", new Date(from).toISOString());
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        q = q.lte("created_at", end.toISOString());
      }
      const start = page * PAGE_SIZE;
      q = q.range(start, start + PAGE_SIZE - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      const list = (data || []) as Row[];
      setRows(list);
      setTotal(count || 0);

      // Resolve sent_by → display name (best-effort).
      const missing = Array.from(
        new Set(list.map((r) => r.sent_by).filter((id): id is string => !!id && !senderNames[id])),
      );
      if (missing.length) {
        const { data: profs } = await (supabase.from("profiles") as any)
          .select("user_id, full_name, email")
          .in("user_id", missing);
        if (profs) {
          setSenderNames((prev) => {
            const next = { ...prev };
            (profs as any[]).forEach((p) => {
              next[p.user_id] = p.full_name || p.email || p.user_id;
            });
            return next;
          });
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to load KYC email log");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAllowed) return;
    fetchPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAllowed, page, status, from, to]);

  useEffect(() => {
    if (!isAllowed) return;
    const t = setTimeout(() => {
      setPage(0);
      fetchPage();
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderSearch, emailSearch]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  if (authLoading) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
        Loading…
      </div>
    );
  }
  if (!isAllowed) return <Navigate to="/admin" replace />;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">KYC Email Log</h1>
        <p className="text-sm text-muted-foreground">
          Every customer KYC / portal-invite email attempt sent on order creation or via staff resend.
        </p>
      </div>

      <Card>
        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2">
            <Label>Order number</Label>
            <Input
              placeholder="ORD2600320 / ORD-…"
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
            />
          </div>
          <div className="lg:col-span-2">
            <Label>Recipient email</Label>
            <Input
              placeholder="customer@example.com"
              value={emailSearch}
              onChange={(e) => setEmailSearch(e.target.value)}
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
            </div>
          </div>
          <div className="md:col-span-3 lg:col-span-6 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOrderSearch(""); setEmailSearch(""); setStatus("all");
                setFrom(""); setTo(""); setPage(0);
              }}
            >
              Reset filters
            </Button>
            <Button size="sm" onClick={() => { setPage(0); fetchPage(); }}>
              <RefreshCw className="h-3 w-3 mr-1" />Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>{total.toLocaleString()} entries</span>
            <span className="text-xs font-normal text-muted-foreground">
              Page {page + 1} of {pageCount}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No KYC email entries match these filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">When</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Attempts</TableHead>
                    <TableHead>Error / reason</TableHead>
                    <TableHead>Sent by</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(new Date(r.created_at), "dd MMM yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.order_number || "—"}</TableCell>
                      <TableCell className="text-xs">{r.recipient_email || "—"}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-right text-xs">{r.attempt_count ?? "—"}</TableCell>
                      <TableCell
                        className="text-xs max-w-md truncate"
                        title={r.error || ""}
                      >
                        {r.error || "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.sent_by ? (senderNames[r.sent_by] || r.sent_by.slice(0, 8)) : "system"}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.order_id ? (
                          <Button asChild size="sm" variant="ghost" className="h-7">
                            <Link to={`/orders?tab=list&order_id=${encodeURIComponent(r.order_id)}`}>
                              Open <ArrowRight className="h-3 w-3 ml-1" />
                            </Link>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex items-center justify-between mt-4">
            <div className="text-xs text-muted-foreground">
              Showing {rows.length === 0 ? 0 : page * PAGE_SIZE + 1}
              –{page * PAGE_SIZE + rows.length} of {total.toLocaleString()}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page + 1 >= pageCount || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}