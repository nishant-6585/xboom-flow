import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronRight, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { useUpcomingHolidays, HolidayType } from "@/hooks/useHolidays";

const TYPE_STYLES: Record<HolidayType, string> = {
  national: "bg-primary/10 text-primary border-primary/20",
  regional: "bg-accent/10 text-accent-foreground border-accent/20",
  company: "bg-secondary text-secondary-foreground border-border",
  religious: "bg-muted text-muted-foreground border-border",
  restricted: "bg-destructive/10 text-destructive border-destructive/20",
};

export function HolidayCalendarWidget() {
  const { data: holidays = [], isLoading } = useUpcomingHolidays(5);

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          Upcoming Holidays
        </CardTitle>
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
          <Link to="/hr?tab=holidays">View all <ChevronRight className="h-3 w-3 ml-1" /></Link>
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : holidays.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No upcoming holidays</p>
        ) : (
          <ul className="space-y-2">
            {holidays.map((h) => {
              const d = parseISO(h.holiday_date);
              return (
                <li key={h.id} className="flex items-center gap-3 rounded-md border border-border/50 px-3 py-2">
                  <div className="flex flex-col items-center justify-center w-12 shrink-0">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{format(d, "EEE")}</span>
                    <span className="text-base font-semibold leading-none">{format(d, "dd")}</span>
                    <span className="text-[10px] text-muted-foreground">{format(d, "MMM")}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{h.name}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Badge variant="outline" className={`text-[10px] py-0 h-4 ${TYPE_STYLES[h.holiday_type]}`}>
                        {h.holiday_type}
                      </Badge>
                      {h.is_restricted && (
                        <Badge variant="outline" className="text-[10px] py-0 h-4">Restricted</Badge>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
