import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUntouchedLeads } from "@/hooks/useUntouchedLeads";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Flame } from "lucide-react";

const ALERT_SESSION_KEY = "untouched_alert_shown";

export function UntouchedLoginAlert() {
  const { user, role } = useAuth();
  const { data: leads } = useUntouchedLeads();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Only for sales rep + sales manager. Admins do not get this org-wide alert.
  const isSales = role === "sales" || role === "sales_manager";

  // For sales managers: fetch the user_ids of their direct reportees so we can
  // scope the alert to leads assigned to their team (not the whole org).
  const { data: reporteeIds } = useQuery({
    queryKey: ["untouched-alert-reportees", user?.id],
    enabled: !!user?.id && role === "sales_manager",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("reporting_manager_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.user_id).filter(Boolean) as string[];
    },
    staleTime: 5 * 60_000,
  });

  const scopedLeads = (() => {
    if (!leads || !user) return [];
    if (role === "sales") {
      return leads.filter((l) => l.sales_person_id === user.id);
    }
    if (role === "sales_manager") {
      // Include manager's own + their reportees' leads
      const allowed = new Set<string>([user.id, ...(reporteeIds ?? [])]);
      return leads.filter((l) => l.sales_person_id && allowed.has(l.sales_person_id));
    }
    return [];
  })();

  useEffect(() => {
    if (!user || !isSales || !leads || leads.length === 0) return;
    if (sessionStorage.getItem(ALERT_SESSION_KEY)) return;
    if (role === "sales_manager" && reporteeIds === undefined) return; // wait for reportees

    const hasUrgent = scopedLeads.some((l) => l.bucket === "T+2" || l.bucket === "T+3" || l.bucket === "T++");
    if (hasUrgent) {
      setOpen(true);
      sessionStorage.setItem(ALERT_SESSION_KEY, "1");
    }
  }, [user, leads, isSales, role, reporteeIds, scopedLeads]);

  if (!leads || !isSales) return null;

  const myLeads = scopedLeads;

  const t1 = myLeads.filter((l) => l.bucket === "T+1").length;
  const t2 = myLeads.filter((l) => l.bucket === "T+2").length;
  const t3 = myLeads.filter((l) => l.bucket === "T+3").length;
  const tPlus = myLeads.filter((l) => l.bucket === "T++").length;

  if (t2 + t3 + tPlus === 0) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Untouched Leads Alert
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ⚠️ You have <span className="font-bold text-foreground">{myLeads.length}</span> untouched leads pending action:
            </p>
            <div className="grid grid-cols-2 gap-3">
              {t1 > 0 && (
                <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-center">
                  <p className="text-lg font-bold text-yellow-700 dark:text-yellow-400">{t1}</p>
                  <p className="text-xs text-yellow-600 dark:text-yellow-500">T+1 (24-48h)</p>
                </div>
              )}
              {t2 > 0 && (
                <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-center">
                  <p className="text-lg font-bold text-orange-700 dark:text-orange-400">{t2}</p>
                  <p className="text-xs text-orange-600 dark:text-orange-500">T+2 (48-72h)</p>
                </div>
              )}
              {t3 > 0 && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-center">
                  <p className="text-lg font-bold text-red-700 dark:text-red-400">{t3}</p>
                  <p className="text-xs text-red-600 dark:text-red-500">T+3 (72-96h)</p>
                </div>
              )}
              {tPlus > 0 && (
                <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/40 text-center border border-red-300 dark:border-red-700">
                  <Flame className="w-4 h-4 mx-auto text-red-700 dark:text-red-400 mb-1" />
                  <p className="text-lg font-bold text-red-800 dark:text-red-300">{tPlus}</p>
                  <p className="text-xs text-red-700 dark:text-red-400 font-semibold">T++ (96h+) CRITICAL</p>
                </div>
              )}
            </div>
            <Button
              className="w-full"
              variant="destructive"
              onClick={() => {
                setOpen(false);
                navigate("/sales?tab=untouched");
              }}
            >
              View Untouched Leads →
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Persistent banner */}
      {!open && (t2 + t3 + tPlus > 0) && (
        <div
          className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center justify-between cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          onClick={() => navigate("/sales?tab=untouched")}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-medium text-red-700 dark:text-red-400">
              ⚠️ {myLeads.length} untouched leads pending — {tPlus > 0 ? `${tPlus} critical (T++)` : `${t3 > 0 ? t3 + " in T+3" : t2 + " in T+2"}`}
            </span>
          </div>
          <Button variant="ghost" size="sm" className="text-red-700 dark:text-red-400 text-xs">
            View →
          </Button>
        </div>
      )}
    </>
  );
}
