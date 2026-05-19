import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, PartyPopper } from "lucide-react";
import { useHolidays, Holiday } from "@/hooks/useHolidays";
import { format, parseISO, differenceInCalendarDays, startOfDay } from "date-fns";
import { useMemo } from "react";

export function UpcomingHolidaysWidget() {
  const today = startOfDay(new Date());
  const year = today.getFullYear();
  const { holidays: thisYear, isLoading } = useHolidays(year);
  const { holidays: nextYear } = useHolidays(year + 1);

  const upcoming = useMemo<Holiday[]>(() => {
    const all = [...thisYear, ...nextYear];
    return all
      .filter((h) => parseISO(h.date) >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
  }, [thisYear, nextYear, today]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          Upcoming Holidays
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming holidays.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((h) => {
              const d = parseISO(h.date);
              const days = differenceInCalendarDays(d, today);
              const label =
                days === 0 ? "Today" : days === 1 ? "Tomorrow" : `in ${days} days`;
              return (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-3 text-sm border-b last:border-b-0 pb-2 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate flex items-center gap-1">
                      {days <= 1 && <PartyPopper className="h-3.5 w-3.5 text-primary" />}
                      {h.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(d, "EEE, dd MMM yyyy")}
                    </div>
                  </div>
                  <Badge variant={days <= 1 ? "default" : "outline"} className="shrink-0 text-xs">
                    {label}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}