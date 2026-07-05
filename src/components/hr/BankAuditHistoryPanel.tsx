import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  employeeId: string;
}

interface AuditRow {
  id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  created_at: string;
  changed_by_name?: string | null;
}

/**
 * HR/Admin-only view of an employee's bank_account / ifsc_code change history.
 * RLS on employee_bank_audit_log restricts SELECT to admin/hr/finance, so a
 * non-privileged viewer will simply see an empty list (query returns 0 rows).
 */
export function BankAuditHistoryPanel({ employeeId }: Props) {
  const { roles } = useAuth();
  const isPrivileged = (roles ?? []).some(
    (r) => r === "admin" || r === "hr" || r === "finance"
  );
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isPrivileged || !employeeId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("employee_bank_audit_log")
        .select("id, field_name, old_value, new_value, changed_by, created_at")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (error) {
        console.error("bank audit fetch failed", error);
        setRows([]);
      } else {
        const list = (data ?? []) as AuditRow[];
        const actorIds = Array.from(
          new Set(list.map((r) => r.changed_by).filter((v): v is string => !!v))
        );
        if (actorIds.length) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", actorIds);
          const byId = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
          list.forEach((r) => {
            r.changed_by_name = r.changed_by ? byId.get(r.changed_by) ?? null : null;
          });
        }
        setRows(list);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [employeeId, isPrivileged]);

  if (!isPrivileged) return null;

  return (
    <div>
      <h4 className="text-sm font-semibold text-primary mb-3">
        Bank Change Audit
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          (HR / Admin / Finance only)
        </span>
      </h4>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No bank_account or ifsc_code changes recorded.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Field</th>
                <th className="px-3 py-2 font-medium">Old</th>
                <th className="px-3 py-2 font-medium">New</th>
                <th className="px-3 py-2 font-medium">Changed by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {format(new Date(r.created_at), "dd MMM yyyy, HH:mm")}
                  </td>
                  <td className="px-3 py-2 font-mono">{r.field_name}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">
                    {r.old_value ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono">{r.new_value ?? "—"}</td>
                  <td className="px-3 py-2">
                    {r.changed_by_name ?? (r.changed_by ? r.changed_by.slice(0, 8) : "system")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}