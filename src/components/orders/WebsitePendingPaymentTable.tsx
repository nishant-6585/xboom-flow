import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { differenceInDays, format } from "date-fns";
import {
  Clock,
  MoreHorizontal,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Inbox,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCanMarkWebsitePayment } from "@/hooks/useCanMarkWebsitePayment";
import {
  useWebsitePendingOrders,
  type WebsitePendingOrder,
} from "@/hooks/useWebsitePendingOrders";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { TableSkeleton, EmptyState, DataErrorState } from "@/components/data-states";

const PAGE_SIZE = 50;

function formatINR(n: number | null | undefined) {
  const v = Number(n) || 0;
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function WebsitePendingPaymentTable() {
  const qc = useQueryClient();
  const { role } = useAuth();
  const { canMark, isLoading: canMarkLoading } = useCanMarkWebsitePayment();
  const { rows, isLoading, error, refetch } = useWebsitePendingOrders();

  const canCancel =
    role === "admin" || role === "finance" || role === "supply_chain";

  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<WebsitePendingOrder | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paged = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["website-pending-orders"] });
    qc.invalidateQueries({ queryKey: ["orders"] });
  };

  const handleMarkPaid = async (o: WebsitePendingOrder) => {
    if (!canMark) return;
    if (!confirm(`Mark order ${o.order_number ?? o.external_id ?? o.id.slice(0, 8)} as Payment Received?`))
      return;
    setBusyId(o.id);
    try {
      const { error } = await supabase.rpc(
        "mark_website_order_paid" as never,
        { _order_id: o.id } as never,
      );
      if (error) throw error;
      toast.success("Payment marked received — procurement created");
      invalidate();
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not mark payment received");
    } finally {
      setBusyId(null);
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    setBusyId(cancelTarget.id);
    try {
      const { error } = await supabase.rpc(
        "cancel_website_order" as never,
        { _order_id: cancelTarget.id, _reason: cancelReason || null } as never,
      );
      if (error) throw error;
      toast.success("Cancelled — added to leads for follow-up");
      setCancelTarget(null);
      setCancelReason("");
      invalidate();
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not cancel order");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Banner */}
      <Card className="border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Website orders awaiting payment</p>
            <p className="text-muted-foreground mt-0.5">
              Procurement is <strong>not</strong> created until payment is received.
              Cancelled orders here are automatically routed to{" "}
              <strong>Sales Leads</strong> for follow-up.
            </p>
          </div>
        </div>
      </Card>

      <Card className="border-border/60">
        {isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={8} columns={8} />
          </div>
        ) : error ? (
          <DataErrorState message={error.message} onRetry={() => refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No website orders awaiting payment"
            description="All website orders are either paid or cancelled."
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead className="text-right">Days Pending</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((o) => {
                  const orderDate = o.order_date || o.created_at;
                  const daysPending = differenceInDays(new Date(), new Date(orderDate));
                  const wcUrl = o.external_id
                    ? `https://www.xboom.in/wp-admin/post.php?post=${o.external_id}&action=edit`
                    : null;
                  const busy = busyId === o.id;

                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{o.order_number ?? o.external_id ?? o.id.slice(0, 8)}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5">WC</Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{o.customer_name}</div>
                        {o.customer_company && (
                          <div className="text-xs text-muted-foreground">{o.customer_company}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {o.customer_phone || o.customer_email || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="truncate max-w-[200px]" title={o.product_name}>
                          {o.product_name}
                        </div>
                        <div className="text-xs text-muted-foreground">Qty: {o.quantity}</div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatINR(o.total_sales_amount)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(orderDate), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={daysPending > 7 ? "destructive" : daysPending > 3 ? "secondary" : "outline"}
                        >
                          {daysPending}d
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={busy}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canMark && !canMarkLoading && (
                              <DropdownMenuItem onClick={() => handleMarkPaid(o)} disabled={busy}>
                                <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" />
                                Mark Payment Received
                              </DropdownMenuItem>
                            )}
                            {canCancel && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setCancelTarget(o);
                                  setCancelReason("");
                                }}
                                disabled={busy}
                              >
                                <XCircle className="h-4 w-4 mr-2 text-destructive" />
                                Cancel order
                              </DropdownMenuItem>
                            )}
                            {wcUrl && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                  <a href={wcUrl} target="_blank" rel="noreferrer">
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    View on WC site
                                  </a>
                                </DropdownMenuItem>
                              </>
                            )}
                            {!canMark && !canCancel && (
                              <DropdownMenuItem disabled>
                                <Clock className="h-4 w-4 mr-2" />
                                No actions available
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Showing {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, rows.length)} of {rows.length}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this website order?</AlertDialogTitle>
            <AlertDialogDescription>
              The order will be marked cancelled and a follow-up{" "}
              <strong>sales lead</strong> will be created automatically so the sales
              team can chase the abandoned cart.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Reason (optional)</Label>
            <Textarea
              id="cancel-reason"
              placeholder="e.g. Customer requested cancellation, payment failed twice…"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}