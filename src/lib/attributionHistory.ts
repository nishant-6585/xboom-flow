import type { AttributionLogEntry } from '@/hooks/useAttributionRequests';

/** Where a history row originated: the direct attribution log, or the
 *  request-approval audit trail. Rendered as a badge so users never need a
 *  second (duplicate) list to tell the two apart. */
export type AttributionOrigin = 'history' | 'audit';

export interface AttributionHistoryEntry extends AttributionLogEntry {
  origin: AttributionOrigin;
}

export function originOf(entry: Pick<AttributionLogEntry, 'source'>): AttributionOrigin {
  return entry.source === 'approved_request' ? 'audit' : 'history';
}

export const ORIGIN_LABEL: Record<AttributionOrigin, string> = {
  history: 'from history',
  audit: 'from audit',
};

/** Rows written by both the RPC and the guard trigger can land within a
 *  second of each other, producing visually identical entries. Collapse them. */
const DEDUPE_WINDOW_MS = 5000;

function bucketKey(e: AttributionLogEntry): string {
  return [
    e.order_id,
    e.to_sales_person_id,
    e.changed_by ?? '',
    e.reason ?? '',
    e.reason_custom ?? '',
    e.source,
  ].join('|');
}

/**
 * De-duplicates the attribution history feed:
 *  - drops repeated row ids (double-fetch / realtime echo)
 *  - collapses identical events emitted within DEDUPE_WINDOW_MS by different
 *    write paths (attribution RPC + guard trigger), keeping the newest.
 * Output stays sorted newest-first.
 */
export function dedupeAttributionHistory(
  rows: AttributionLogEntry[] | null | undefined,
): AttributionHistoryEntry[] {
  if (!rows?.length) return [];
  const sorted = [...rows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const seenIds = new Set<string>();
  const kept: AttributionHistoryEntry[] = [];
  const lastByKey = new Map<string, number>();

  for (const r of sorted) {
    if (seenIds.has(r.id)) continue;
    seenIds.add(r.id);
    const key = bucketKey(r);
    const ts = new Date(r.created_at).getTime();
    const prev = lastByKey.get(key);
    if (prev != null && Math.abs(prev - ts) <= DEDUPE_WINDOW_MS) continue;
    lastByKey.set(key, ts);
    kept.push({ ...r, origin: originOf(r) });
  }
  return kept;
}
