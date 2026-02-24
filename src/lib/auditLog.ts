import { supabase } from "@/integrations/supabase/client";

interface AuditEntry {
  action: string;
  targetUserId?: string;
  details?: Record<string, any>;
}

/**
 * Record an entry in the security_audit_log table.
 * Fire-and-forget — never blocks the caller.
 */
export const recordAuditLog = async (
  userId: string,
  userName: string,
  entry: AuditEntry
) => {
  try {
    await supabase.from("security_audit_log").insert({
      user_id: userId,
      user_name: userName,
      action: entry.action,
      target_user_id: entry.targetUserId ?? null,
      details: entry.details ?? null,
      ip_address: null, // could be enriched server-side
      user_agent: navigator.userAgent,
    });
  } catch (e) {
    console.error("Failed to write audit log:", e);
  }
};
