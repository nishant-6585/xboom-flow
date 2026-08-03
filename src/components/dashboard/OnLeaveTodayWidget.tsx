import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CalendarOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface OnLeaveRow {
  employee_id: string;
  employee_name: string;
  department: string | null;
  designation: string | null;
  leave_type: string;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
}

const LEAVE_LABEL: Record<string, string> = {
  casual: "Casual",
  sick: "Sick",
  paid: "Paid",
  EL: "Earned",
  unpaid: "Unpaid",
  compoff: "Comp-off",
  half_day: "Half Day",
  half_day_casual: "Half Day (Casual)",
  half_day_sick: "Half Day (Sick)",
  half_day_paid: "Half Day (Paid)",
  half_day_EL: "Half Day (Earned)",
  half_day_unpaid: "Half Day (Unpaid)",
  maternity: "Maternity",
};

const initialsOf = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");

export function OnLeaveTodayWidget() {
  const [rows, setRows] = useState<OnLeaveRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.rpc("get_employees_on_leave_today");
      if (!mounted) return;
      if (!error && data) setRows(data as OnLeaveRow[]);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base font-semibold">
          <span className="flex items-center gap-2">
            <CalendarOff className="h-4 w-4 text-amber-600" />
            On Leave Today
          </span>
          <Badge variant="secondary" className="font-mono">
            {loading ? "…" : rows.length}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {format(new Date(), "EEEE, dd MMM yyyy")}
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            🎉 Everyone is available today.
          </p>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {rows.map((r) => (
              <li
                key={r.employee_id}
                className="flex items-center gap-3 rounded-md border bg-muted/30 px-2.5 py-2"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs bg-amber-100 text-amber-800">
                    {initialsOf(r.employee_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.employee_name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {r.department || r.designation || "—"}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="text-[10px] border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30"
                >
                  {LEAVE_LABEL[r.leave_type] || r.leave_type}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}