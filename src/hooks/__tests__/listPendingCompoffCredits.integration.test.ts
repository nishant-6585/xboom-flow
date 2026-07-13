import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

/**
 * Integration test — hits the live Data API for
 * public.list_pending_compoff_credits.
 *
 * Regression guard for the "structure of query does not match function
 * result type" (SQLSTATE 42804) bug caused when compoff_ledger column
 * types drift away from the RPC's declared TABLE(...) signature.
 *
 * We call as an anonymous (non-HR/admin) user, so the RPC is expected
 * to reject with "Only HR or Admin can list pending comp-off credits".
 * That rejection is fine — what MUST NOT happen is a 42804 structure
 * mismatch, which indicates a real type-drift regression regardless of
 * caller identity.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const runIf = url && anonKey ? describe : describe.skip;

runIf('list_pending_compoff_credits — return-type alignment', () => {
  const supabase = createClient(url!, anonKey!, { auth: { persistSession: false } });

  it('does not throw the "structure of query does not match function result type" error', async () => {
    const { error } = await supabase.rpc('list_pending_compoff_credits' as any, {
      p_search: null,
      p_worked_from: null,
      p_worked_to: null,
      p_expiry_filter: 'all',
      p_sort_by: 'submitted',
      p_sort_dir: 'desc',
      p_page: 1,
      p_page_size: 5,
    } as any);

    if (error) {
      // Type-mismatch drift is what we're guarding against.
      expect(error.code).not.toBe('42804');
      expect(String(error.message)).not.toMatch(
        /structure of query does not match function result type/i,
      );
    }
  });

  it('exercises every sort column so an aliased-column type drift also surfaces', async () => {
    for (const sort of ['employee', 'worked', 'expiry', 'submitted'] as const) {
      const { error } = await supabase.rpc('list_pending_compoff_credits' as any, {
        p_search: null,
        p_worked_from: null,
        p_worked_to: null,
        p_expiry_filter: 'all',
        p_sort_by: sort,
        p_sort_dir: 'asc',
        p_page: 1,
        p_page_size: 1,
      } as any);
      if (error) {
        expect(error.code, `sort=${sort}`).not.toBe('42804');
        expect(String(error.message), `sort=${sort}`).not.toMatch(
          /structure of query does not match function result type/i,
        );
      }
    }
  });
});