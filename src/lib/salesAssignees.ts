import { supabase } from "@/integrations/supabase/client";
import { filterAllowedAssignees } from "@/lib/allowedAssignees";

export interface AssignableSalesperson {
  user_id: string;
  name: string;
}

/**
 * Single source of truth for "Assigned To" dropdown options.
 *
 * Uses the SECURITY DEFINER RPC first so admins and sales managers always see
 * the full sales roster even when RLS on profiles / user_roles / employees
 * would hide those rows (this is why some managers saw only "Unassigned").
 * Falls back to the direct tables, and to the unfiltered roster when the
 * name allow-list matches nobody.
 */
export async function fetchAssignableSalespeople(): Promise<AssignableSalesperson[]> {
  let roster: AssignableSalesperson[] = [];

  const { data: rpcRows } = await supabase.rpc("list_sales_attribution_candidates" as any);
  if (Array.isArray(rpcRows) && rpcRows.length) {
    roster = (rpcRows as any[])
      .filter((r) => r.user_id)
      .map((r) => ({ user_id: r.user_id as string, name: (r.name || r.email || "Unknown") as string }));
  }

  if (!roster.length) {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["sales", "sales_manager"] as any);
    const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .eq("is_approved", true)
        .in("user_id", ids);
      roster = (profs ?? []).map((p: any) => ({
        user_id: p.user_id,
        name: p.name || p.email || "Unknown",
      }));
    }
  }

  const allowed = filterAllowedAssignees(roster);
  const list = allowed.length ? allowed : roster;
  return list.sort((a, b) => a.name.localeCompare(b.name));
}
