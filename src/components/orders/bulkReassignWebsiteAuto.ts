import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Pure orchestrator behind BulkReassignWebsiteAutoDialog. Extracted so it
 * can be integration-tested without booting Radix Select in jsdom.
 *
 * For every Woo external_id it:
 *   1. Resolves the internal orders.id (single batch SELECT ... in (...)).
 *   2. Invokes attribute_website_order for each row, letting the guard
 *      trigger normalize source='manual' + sales_attribution_locked=true.
 */
export interface BulkAttributeArgs {
  supabase: Pick<SupabaseClient, 'from'>;
  attribute: (p: {
    orderId: string;
    salesPersonId: string;
    reason: string;
    reasonCustom?: string | null;
  }) => Promise<void>;
  externalIds: string[];
  salesPersonId: string;
  reason: string;
  reasonCustom?: string | null;
  onProgress?: (p: { done: number; total: number; failed: number }) => void;
}

export interface BulkAttributeResult {
  done: number;
  failed: number;
  attempted: string[]; // external_ids that resolved to an internal row
}

export async function bulkAttributeWebsiteAuto(
  args: BulkAttributeArgs,
): Promise<BulkAttributeResult> {
  const {
    supabase, attribute, externalIds, salesPersonId,
    reason, reasonCustom, onProgress,
  } = args;

  const ids = externalIds.map(String);
  const { data: internal, error: lookupErr } = await (supabase as any)
    .from('orders')
    .select('id, external_id')
    .in('external_id', ids);
  if (lookupErr) throw lookupErr;

  const byExt = new Map<string, string>();
  (internal ?? []).forEach((r: any) => byExt.set(String(r.external_id), r.id));

  let done = 0;
  let failed = 0;
  const attempted: string[] = [];
  for (const ext of ids) {
    const orderId = byExt.get(ext);
    if (!orderId) { failed++; continue; }
    attempted.push(ext);
    try {
      await attribute({
        orderId,
        salesPersonId,
        reason,
        reasonCustom: reason === 'other' ? (reasonCustom ?? '') : null,
      });
      done++;
    } catch (e) {
      failed++;
    }
    onProgress?.({ done, total: ids.length, failed });
  }
  return { done, failed, attempted };
}