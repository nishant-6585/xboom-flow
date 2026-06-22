import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, Award, Send } from 'lucide-react';
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
  const [reason, setReason] = useState<string>('');
  const [reasonCustom, setReasonCustom] = useState('');

  const allowed = role === 'admin' || role === 'sales_manager' || role === 'sales';

  const searchQ = useQuery({
    queryKey: ['claimable-website-order', appliedQuery],
    enabled: !!appliedQuery && allowed,
    queryFn: async (): Promise<ClaimableOrder[]> => {
      const { data, error } = await supabase.rpc('find_claimable_website_order' as any, {
        p_query: appliedQuery,
      });
      if (error) throw error;
      return (data ?? []) as ClaimableOrder[];
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
    if (q.length < 3) {
      toast({ title: 'Enter at least 3 characters', description: 'Order number, phone, or email.', variant: 'destructive' });
      return;
    }
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
    try {
      await requestAttribution.mutateAsync({
        orderId,
        reason,
        reasonCustom: reason === 'other' ? reasonCustom.trim() : null,
      });
      toast({ title: 'Claim submitted', description: 'A manager will review your request.' });
      setReason('');
      setReasonCustom('');
      setAppliedQuery('');
      setQuery('');
      qc.invalidateQueries({ queryKey: ['my-claim-requests'] });
    } catch (e) {
      toast({
        title: 'Failed to submit',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
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
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Order number, phone or email"
                className="pl-8"
              />
            </div>
            <Button type="submit" disabled={searchQ.isFetching}>
              {searchQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
          </form>

          {appliedQuery && (
            <div className="space-y-3">
              {searchQ.isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : !searchQ.data || searchQ.data.length === 0 ? (
                <Card className="border-dashed bg-muted/20">
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    No eligible website order found for "{appliedQuery}". It may already be
                    claimed, not paid yet, or not a website order.
                  </CardContent>
                </Card>
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
                            disabled={requestAttribution.isPending}
                            className="gap-1.5"
                          >
                            {requestAttribution.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                            Request to claim
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
                  <Badge variant="outline" className={statusBadge(r.status)}>
                    {r.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}