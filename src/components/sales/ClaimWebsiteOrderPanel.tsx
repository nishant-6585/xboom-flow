import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, Award, Send, Info, HelpCircle, Eye } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { ATTRIBUTION_REASONS } from '@/components/orders/OrderAttributionPanel';
import { useAttributionMutations } from '@/hooks/useAttributionRequests';

interface ClaimableOrder {
  order_id: string;
  order_number: string | null;
  order_date: string | null;
  product_name: string | null;
  total: number | null;
  customer_name_masked: string | null;
}

interface MyRequestRow {
  id: string;
  order_id: string;
  reason: string | null;
  reason_custom: string | null;
  status: 'pending' | 'approved' | 'rejected';
  decision_note: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  created_at: string;
}

type QueryKind = 'order_number' | 'phone' | 'email' | 'unknown';

function detectQueryKind(q: string): QueryKind {
  const s = q.trim();
  if (!s) return 'unknown';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'email';
  const digits = s.replace(/[^\d]/g, '');
  if (digits.length >= 7 && digits.length <= 15 && /^[+\d\s\-()]+$/.test(s)) return 'phone';
  if (/^#?[a-z0-9\-_/]+$/i.test(s)) return 'order_number';
  return 'unknown';
}

function validateQuery(q: string): { ok: true; kind: QueryKind } | { ok: false; error: string } {
  const s = q.trim();
  if (s.length < 3) return { ok: false, error: 'Enter at least 3 characters to search.' };
  if (s.length > 100) return { ok: false, error: 'Search term is too long (max 100 characters).' };
  const kind = detectQueryKind(s);
  if (kind === 'unknown') {
    return {
      ok: false,
      error: 'Search must be an order number, phone (7–15 digits), or email address.',
    };
  }
  if (kind === 'email' && s.length > 254) return { ok: false, error: 'Email is too long.' };
  return { ok: true, kind };
}

async function logAudit(payload: {
  event_type: string;
  actor_id: string | null;
  actor_role?: string | null;
  order_id?: string | null;
  request_id?: string | null;
  outcome?: string | null;
  reason_code?: string | null;
  error_code?: string | null;
  query_length?: number | null;
  query_kind?: string | null;
  result_count?: number | null;
  metadata?: Record<string, unknown>;
}) {
  if (!payload.actor_id) return;
  try {
    await (supabase as any).from('claim_audit_log').insert({
      event_type: payload.event_type,
      actor_id: payload.actor_id,
      actor_role: payload.actor_role ?? null,
      order_id: payload.order_id ?? null,
      request_id: payload.request_id ?? null,
      outcome: payload.outcome ?? null,
      reason_code: payload.reason_code ?? null,
      error_code: payload.error_code ?? null,
      query_length: payload.query_length ?? null,
      query_kind: payload.query_kind ?? null,
      result_count: payload.result_count ?? null,
      metadata: payload.metadata ?? {},
    });
  } catch {
    // Audit logging must never break the user flow.
  }
}

function reasonLabel(v?: string | null) {
  if (!v) return '—';
  return ATTRIBUTION_REASONS.find((r) => r.value === v)?.label ?? v;
}

function statusBadge(s: MyRequestRow['status']) {
  if (s === 'approved') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
  if (s === 'rejected') return 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400';
  return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400';
}

export function ClaimWebsiteOrderPanel() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const { requestAttribution } = useAttributionMutations();

  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [queryError, setQueryError] = useState<string | null>(null);
  const [reason, setReason] = useState<string>('');
  const [reasonCustom, setReasonCustom] = useState('');
  const [submittingOrderId, setSubmittingOrderId] = useState<string | null>(null);
  const [detailsRow, setDetailsRow] = useState<MyRequestRow | null>(null);

  const allowed = role === 'admin' || role === 'sales_manager' || role === 'sales';

  const searchQ = useQuery({
    queryKey: ['claimable-website-order', appliedQuery],
    enabled: !!appliedQuery && allowed,
    queryFn: async (): Promise<ClaimableOrder[]> => {
      const { data, error } = await supabase.rpc('find_claimable_website_order' as any, {
        p_query: appliedQuery,
      });
      if (error) {
        await logAudit({
          event_type: 'claim_failed',
          actor_id: user?.id ?? null,
          actor_role: role ?? null,
          outcome: 'error',
          error_code: 'search_rpc_error',
          query_length: appliedQuery.length,
          query_kind: detectQueryKind(appliedQuery),
          metadata: { stage: 'search' },
        });
        throw error;
      }
      const rows = (data ?? []) as ClaimableOrder[];
      await logAudit({
        event_type: rows.length === 0 ? 'search_no_results' : 'search',
        actor_id: user?.id ?? null,
        actor_role: role ?? null,
        outcome: 'ok',
        query_length: appliedQuery.length,
        query_kind: detectQueryKind(appliedQuery),
        result_count: rows.length,
      });
      return rows;
    },
  });

  const myReqs = useQuery({
    queryKey: ['my-claim-requests', user?.id],
    enabled: !!user?.id && allowed,
    queryFn: async (): Promise<MyRequestRow[]> => {
      const { data, error } = await supabase
        .from('sales_attribution_requests')
        .select('id, order_id, reason, reason_custom, status, decision_note, decided_by_name, decided_at, created_at')
        .eq('requested_by', user!.id)
        .order('created_at', { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as MyRequestRow[];
    },
  });

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    const v = validateQuery(q);
    if (!v.ok) {
      setQueryError(v.error);
      toast({ title: 'Invalid search', description: v.error, variant: 'destructive' });
      return;
    }
    setQueryError(null);
    setAppliedQuery(q);
  };

  const handleClaim = async (orderId: string) => {
    if (!reason) {
      toast({ title: 'Pick a reason', variant: 'destructive' });
      return;
    }
    if (reason === 'other' && !reasonCustom.trim()) {
      toast({ title: 'Describe the reason', variant: 'destructive' });
      return;
    }
    setSubmittingOrderId(orderId);
    await logAudit({
      event_type: 'claim_attempt',
      actor_id: user?.id ?? null,
      actor_role: role ?? null,
      order_id: orderId,
      reason_code: reason,
      outcome: 'pending',
    });
    try {
      await requestAttribution.mutateAsync({
        orderId,
        reason,
        reasonCustom: reason === 'other' ? reasonCustom.trim() : null,
      });
      await logAudit({
        event_type: 'claim_submitted',
        actor_id: user?.id ?? null,
        actor_role: role ?? null,
        order_id: orderId,
        reason_code: reason,
        outcome: 'pending',
      });
      toast({
        title: 'Claim submitted',
        description: 'Status: pending — a manager will review your request shortly.',
      });
      setReason('');
      setReasonCustom('');
      setAppliedQuery('');
      setQuery('');
      qc.invalidateQueries({ queryKey: ['my-claim-requests'] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      await logAudit({
        event_type: 'claim_failed',
        actor_id: user?.id ?? null,
        actor_role: role ?? null,
        order_id: orderId,
        reason_code: reason,
        outcome: 'error',
        error_code: 'request_attribution_rpc_error',
        metadata: { message: msg.slice(0, 200) },
      });
      toast({
        title: 'Failed to submit claim',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setSubmittingOrderId(null);
    }
  };

  if (!allowed) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Award className="h-5 w-5 text-primary" />
            Claim a website order
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Search by order number, customer phone, or customer email. Only unclaimed website
            orders are shown.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (queryError) setQueryError(null);
                }}
                placeholder="Order number, phone or email"
                className="pl-8"
                aria-invalid={!!queryError}
                maxLength={100}
              />
            </div>
            <Button type="submit" disabled={searchQ.isFetching}>
              {searchQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
          </form>
          {queryError && (
            <p className="text-xs text-destructive -mt-2">{queryError}</p>
          )}

          {!appliedQuery ? (
            <HelpPanel />
          ) : (
            <div className="space-y-3">
              {searchQ.isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : searchQ.isError ? (
                <Card className="border-destructive/40 bg-destructive/5">
                  <CardContent className="py-6 text-center text-sm text-destructive">
                    Search failed. Please try again in a moment.
                  </CardContent>
                </Card>
              ) : !searchQ.data || searchQ.data.length === 0 ? (
                <NoResultsPanel query={appliedQuery} />
              ) : (
                <div className="grid gap-3">
                  {searchQ.data.map((o) => (
                    <Card key={o.order_id} className="border-primary/30">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-mono font-semibold text-primary">
                            #{o.order_number ?? '—'}
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span className="font-medium">{o.customer_name_masked ?? '—'}</span>
                          {o.total != null && (
                            <span className="text-muted-foreground">
                              · ₹{Number(o.total).toLocaleString('en-IN')}
                            </span>
                          )}
                          {o.order_date && (
                            <span className="text-xs text-muted-foreground">
                              · {new Date(o.order_date).toLocaleDateString('en-IN')}
                            </span>
                          )}
                        </div>
                        {o.product_name && (
                          <div className="text-xs text-muted-foreground">{o.product_name}</div>
                        )}

                        <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
                          <div className="space-y-2">
                            <Label className="text-xs">Reason</Label>
                            <Select value={reason} onValueChange={setReason}>
                              <SelectTrigger>
                                <SelectValue placeholder="Why should this be credited to you?" />
                              </SelectTrigger>
                              <SelectContent>
                                {ATTRIBUTION_REASONS.map((r) => (
                                  <SelectItem key={r.value} value={r.value}>
                                    {r.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {reason === 'other' && (
                              <Textarea
                                value={reasonCustom}
                                onChange={(e) => setReasonCustom(e.target.value)}
                                placeholder="Describe the reason"
                                rows={2}
                              />
                            )}
                          </div>
                          <Button
                            onClick={() => handleClaim(o.order_id)}
                            disabled={requestAttribution.isPending || submittingOrderId !== null}
                            className="gap-1.5"
                          >
                            {submittingOrderId === o.order_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                            {submittingOrderId === o.order_id ? 'Submitting…' : 'Request to claim'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">My claim requests</CardTitle>
        </CardHeader>
        <CardContent>
          {myReqs.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : !myReqs.data || myReqs.data.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              You haven't submitted any claim requests yet.
            </p>
          ) : (
            <div className="divide-y">
              {myReqs.data.map((r) => (
                <div key={r.id} className="py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString('en-IN')}
                    </div>
                    <div className="text-sm">
                      {reasonLabel(r.reason)}
                      {r.reason_custom && <span className="italic"> — "{r.reason_custom}"</span>}
                    </div>
                    {r.decision_note && (
                      <div className="text-xs text-muted-foreground">
                        Manager note: {r.decision_note}
                        {r.decided_by_name ? ` — ${r.decided_by_name}` : ''}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={statusBadge(r.status)}>
                      {r.status}
                    </Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 h-7"
                      onClick={() => setDetailsRow(r)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Details
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ClaimRequestDetailsDialog
        row={detailsRow}
        onClose={() => setDetailsRow(null)}
      />
    </div>
  );
}

function HelpPanel() {
  return (
    <Card className="border-dashed bg-muted/10">
      <CardContent className="py-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <HelpCircle className="h-4 w-4 text-primary" />
          How to claim a website order
        </div>
        <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-5">
          <li>Search by full order number, customer phone, or customer email.</li>
          <li>Only website orders that are not yet attributed to a salesperson appear here.</li>
          <li>Pick a reason, then submit — a manager approves before credit moves to you.</li>
        </ul>
        <div className="rounded-md border bg-background/60 p-3 text-xs space-y-1">
          <div className="font-medium flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-muted-foreground" /> Why an order might not appear
          </div>
          <ul className="text-muted-foreground list-disc pl-4 space-y-0.5">
            <li>It is already attributed to another salesperson.</li>
            <li>It is not a website-sourced order (e.g. manual, marketplace).</li>
            <li>The phone/email on the order doesn't match what you searched.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function NoResultsPanel({ query }: { query: string }) {
  return (
    <Card className="border-dashed bg-muted/20">
      <CardContent className="py-6 space-y-3">
        <div className="text-sm font-medium text-center">
          No eligible website order found for "{query}"
        </div>
        <div className="text-xs text-muted-foreground space-y-2">
          <div className="font-medium text-foreground/80">Possible reasons:</div>
          <ul className="list-disc pl-5 space-y-1">
            <li>The order is already attributed to another salesperson.</li>
            <li>The order isn't sourced from the website.</li>
            <li>The phone/email you searched doesn't match what's on the order.</li>
            <li>Typo in the order number — try the exact number from your email.</li>
          </ul>
          <div className="font-medium text-foreground/80 pt-1">What to try next:</div>
          <ul className="list-disc pl-5 space-y-1">
            <li>Search using the customer's exact phone number (with or without country code).</li>
            <li>Try the customer's email address.</li>
            <li>Ask your manager to confirm whether the order is already attributed.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function ClaimRequestDetailsDialog({
  row,
  onClose,
}: {
  row: MyRequestRow | null;
  onClose: () => void;
}) {
  const open = !!row;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            Claim request details
          </DialogTitle>
          <DialogDescription>Full record of your attribution request.</DialogDescription>
        </DialogHeader>
        {row && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">Status:</span>
              <Badge variant="outline" className={statusBadge(row.status)}>
                {row.status}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-muted-foreground">Submitted</div>
                <div className="font-medium text-sm">
                  {new Date(row.created_at).toLocaleString('en-IN')}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Decided</div>
                <div className="font-medium text-sm">
                  {row.decided_at ? new Date(row.decided_at).toLocaleString('en-IN') : '—'}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-muted-foreground">Order</div>
                <div className="font-mono text-xs">{row.order_id}</div>
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Reason</div>
              <div className="text-sm">{reasonLabel(row.reason)}</div>
              {row.reason_custom && (
                <div className="text-xs italic text-muted-foreground">"{row.reason_custom}"</div>
              )}
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Manager decision</div>
              {row.status === 'pending' ? (
                <div className="text-sm text-muted-foreground">Awaiting review.</div>
              ) : (
                <>
                  <div className="text-sm">
                    {row.decision_note || (
                      <span className="text-muted-foreground">No note provided.</span>
                    )}
                  </div>
                  {row.decided_by_name && (
                    <div className="text-xs text-muted-foreground">— {row.decided_by_name}</div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}