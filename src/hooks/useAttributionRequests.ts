import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { SYSTEM_USER_ID } from '@/lib/orderSource';

export interface AttributionRequest {
  id: string;
  order_id: string;
  requested_by: string;
  requested_by_name: string | null;
  requested_for_sales_person_id: string;
  requested_for_name: string | null;
  reason: string | null;
  reason_custom: string | null;
  status: 'pending' | 'approved' | 'rejected';
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

export interface OrderAttribution {
  id: string;
  external_id: string | null;
  order_number: string | null;
  customer_name: string | null;
  total_sales_amount: number | null;
  sales_person_id: string | null;
  sales_person_name: string | null;
  sales_attribution_locked: boolean | null;
  sales_attribution_reason: string | null;
  sales_attribution_reason_custom: string | null;
  attributed_by_name: string | null;
  attributed_at: string | null;
}

export interface AttributionLogEntry {
  id: string;
  order_id: string;
  from_sales_person_id: string | null;
  to_sales_person_id: string;
  to_sales_person_name: string;
  reason: string | null;
  reason_custom: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  source: 'direct' | 'approved_request';
  created_at: string;
}

/** Full attribution change log for a given internal order. */
export function useAttributionLog(orderId: string | null | undefined) {
  return useQuery({
    queryKey: ['attribution-log', orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<AttributionLogEntry[]> => {
      const { data, error } = await supabase
        .from('sales_attribution_log')
        .select('*')
        .eq('order_id', orderId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AttributionLogEntry[];
    },
  });
}

/** Look up an internal website order by external_id (woo_order_id) or internal id. */
export function useInternalOrderForAttribution(opts: {
  internalOrderId?: string | null;
  externalId?: string | null;
}) {
  const { internalOrderId, externalId } = opts;
  return useQuery({
    queryKey: ['order-attribution', internalOrderId, externalId],
    enabled: !!(internalOrderId || externalId),
    queryFn: async (): Promise<OrderAttribution | null> => {
      let q = supabase
        .from('orders')
        .select(
          'id, external_id, order_number, customer_name, total_sales_amount, sales_person_id, sales_person_name, sales_attribution_locked, sales_attribution_reason, sales_attribution_reason_custom, attributed_by_name, attributed_at',
        )
        .not('external_id', 'is', null)
        .limit(1);
      if (internalOrderId) q = q.eq('id', internalOrderId);
      else if (externalId) q = q.eq('external_id', String(externalId));
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return (data as any) ?? null;
    },
  });
}

/** A sales rep's own attribution request for one order (if any). */
export function useMyAttributionRequest(orderId: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-attribution-request', orderId, user?.id],
    enabled: !!orderId && !!user?.id,
    queryFn: async (): Promise<AttributionRequest | null> => {
      const { data, error } = await supabase
        .from('sales_attribution_requests')
        .select('*')
        .eq('order_id', orderId!)
        .eq('requested_by', user!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as any) ?? null;
    },
  });
}

/** All pending requests — for the manager/admin approvals queue. */
export function usePendingAttributionRequests() {
  return useQuery({
    queryKey: ['pending-attribution-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_attribution_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as AttributionRequest[];
      const orderIds = Array.from(new Set(rows.map((r) => r.order_id)));
      if (!orderIds.length) return { rows, orders: new Map<string, OrderAttribution>() };
      const { data: orders } = await supabase
        .from('orders')
        .select(
          'id, external_id, order_number, customer_name, total_sales_amount, sales_person_id, sales_person_name, sales_attribution_locked, sales_attribution_reason, sales_attribution_reason_custom, attributed_by_name, attributed_at',
        )
        .in('id', orderIds);
      const map = new Map<string, OrderAttribution>();
      ((orders ?? []) as any[]).forEach((o) => map.set(o.id, o));
      return { rows, orders: map };
    },
  });
}

/** Pending attribution requests for a single order — inline in OrderDialog. */
export function usePendingAttributionRequestsForOrder(
  orderId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['pending-attribution-requests-for-order', orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<AttributionRequest[]> => {
      const { data, error } = await supabase
        .from('sales_attribution_requests')
        .select('*')
        .eq('order_id', orderId!)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AttributionRequest[];
    },
  });
}

/** All decided (approved/rejected) attribution requests for an order — audit trail. */
export function useDecidedAttributionRequestsForOrder(
  orderId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['decided-attribution-requests-for-order', orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<AttributionRequest[]> => {
      const { data, error } = await supabase
        .from('sales_attribution_requests')
        .select('*')
        .eq('order_id', orderId!)
        .in('status', ['approved', 'rejected'])
        .order('decided_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AttributionRequest[];
    },
  });
}

export function useAttributionMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['order-attribution'] });
    qc.invalidateQueries({ queryKey: ['my-attribution-request'] });
    qc.invalidateQueries({ queryKey: ['pending-attribution-requests'] });
    qc.invalidateQueries({ queryKey: ['pending-attribution-requests-for-order'] });
    qc.invalidateQueries({ queryKey: ['sales-leaderboard'] });
  };

  const attribute = useMutation({
    mutationFn: async (p: {
      orderId: string;
      salesPersonId: string;
      reason: string;
      reasonCustom?: string | null;
    }) => {
      const { error } = await supabase.rpc('attribute_website_order' as any, {
        p_order_id: p.orderId,
        p_sales_person_id: p.salesPersonId,
        p_reason: p.reason,
        p_reason_custom: p.reasonCustom ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const requestAttribution = useMutation({
    mutationFn: async (p: { orderId: string; reason: string; reasonCustom?: string | null }) => {
      const { error } = await supabase.rpc('request_website_order_attribution' as any, {
        p_order_id: p.orderId,
        p_reason: p.reason,
        p_reason_custom: p.reasonCustom ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const decide = useMutation({
    mutationFn: async (p: { requestId: string; approve: boolean; note?: string | null }) => {
      const { error } = await supabase.rpc('decide_attribution_request' as any, {
        p_request_id: p.requestId,
        p_approve: p.approve,
        p_note: p.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { attribute, requestAttribution, decide, SYSTEM_USER_ID };
}

export { SYSTEM_USER_ID };