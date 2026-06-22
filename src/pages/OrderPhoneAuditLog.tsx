import { useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Loader2, Phone, Search, ShieldCheck } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AuditRow = {
  id: string;
  order_id: string;
  order_number: string | null;
  old_phone: string | null;
  new_phone: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_by_role: string | null;
  source: string | null;
  created_at: string;
};

const roleVariant = (role: string | null): "default" | "secondary" | "destructive" | "outline" => {
  switch (role) {
    case "admin":
      return "destructive";
    case "finance":
      return "default";
    case "supply_chain":
      return "secondary";
    case "sales_manager":
    case "sales":
      return "outline";
    default:
      return "outline";
  }
};

const OrderPhoneAuditLog = () => {
  const { role, isApproved, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [orderId, setOrderId] = useState(searchParams.get("order") ?? "");
  const [fromDate, setFromDate] = useState(searchParams.get("from") ?? "");
  const [toDate, setToDate] = useState(searchParams.get("to") ?? "");

  const canView = role === "admin" || role === "finance";

  const queryKey = useMemo(
    () => ["order-phone-audit", { orderId, fromDate, toDate }],
    [orderId, fromDate, toDate],
  );

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    enabled: canView && !!isApproved,
    queryFn: async (): Promise<AuditRow[]> => {
      let query = supabase
        .from("order_phone_audit_log" as any)
        .select(
          "id, order_id, order_number, old_phone, new_phone, changed_by, changed_by_name, changed_by_role, source, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(500);

      const trimmed = orderId.trim();
      if (trimmed) {
        // Accept either an order UUID or an order_number (case-insensitive partial).
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          trimmed,
        );
        query = isUuid
          ? query.eq("order_id", trimmed)
          : query.ilike("order_number", `%${trimmed}%`);
      }
      if (fromDate) query = query.gte("created_at", `${fromDate}T00:00:00.000Z`);
      if (toDate) query = query.lte("created_at", `${toDate}T23:59:59.999Z`);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
  });

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canView) {
    return <Navigate to="/" replace />;
  }

  const applyFilters = () => {
    const next = new URLSearchParams();
    if (orderId.trim()) next.set("order", orderId.trim());
    if (fromDate) next.set("from", fromDate);
    if (toDate) next.set("to", toDate);
    setSearchParams(next, { replace: true });
    refetch();
  };

  const clearFilters = () => {
    setOrderId("");
    setFromDate("");
    setToDate("");
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const rows = data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold">
                <Phone className="h-5 w-5 text-primary" /> Order Phone Audit Log
              </h1>
              <p className="text-sm text-muted-foreground">
                Server-recorded trail of every mobile number change on orders.
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="h-3 w-3" /> Admin / Finance only
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
            <CardDescription>
              Filter by order ID or number and a date range. Up to 500 most recent matching
              entries are shown.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto_auto]">
              <div className="space-y-1">
                <Label htmlFor="order-id">Order ID / Number</Label>
                <Input
                  id="order-id"
                  placeholder="UUID or order number"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="from-date">From</Label>
                <Input
                  id="from-date"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="to-date">To</Label>
                <Input
                  id="to-date"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={applyFilters} disabled={isFetching}>
                  <Search className="mr-1 h-4 w-4" />
                  Apply
                </Button>
              </div>
              <div className="flex items-end">
                <Button variant="ghost" onClick={clearFilters}>
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Results</CardTitle>
              <CardDescription>
                {isLoading
                  ? "Loading…"
                  : `${rows.length} entr${rows.length === 1 ? "y" : "ies"} found`}
              </CardDescription>
            </div>
            {isFetching && !isLoading && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Old Phone</TableHead>
                    <TableHead>New Phone</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        No phone changes match the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(new Date(row.created_at), "dd MMM yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <div>{row.order_number || "—"}</div>
                        <div className="text-muted-foreground">
                          {row.order_id.slice(0, 8)}
                        </div>
                      </TableCell>
                      <TableCell>{row.changed_by_name || row.changed_by || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={roleVariant(row.changed_by_role)}>
                          {row.changed_by_role || "unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {row.old_phone || <span className="italic">empty</span>}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {row.new_phone || <span className="italic text-muted-foreground">cleared</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.source || "app"}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default OrderPhoneAuditLog;