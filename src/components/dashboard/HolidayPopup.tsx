import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PartyPopper } from "lucide-react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { useTomorrowHoliday, istToday } from "@/hooks/useHolidays";

export function HolidayPopup() {
  const { data: holidays = [] } = useTomorrowHoliday();
  const [open, setOpen] = useState(false);
  const today = istToday();
  const ids = holidays.map((h) => h.id).join(",");
  const storageKey = ids ? `holiday_popup_dismissed:${today}:${ids}` : "";

  useEffect(() => {
    if (!holidays.length) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(storageKey)) return;
    const t = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(t);
  }, [storageKey, holidays.length]);

  const dismiss = () => {
    if (storageKey) localStorage.setItem(storageKey, "1");
    setOpen(false);
  };

  if (!holidays.length) return null;
  const first = holidays[0];
  const tomorrowLabel = format(parseISO(first.holiday_date), "EEEE, dd MMM yyyy");

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : dismiss())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-primary" />
            {holidays.length > 1
              ? `Tomorrow has ${holidays.length} holidays`
              : `Tomorrow is a holiday — ${first.name}`}
          </DialogTitle>
          <DialogDescription>{tomorrowLabel}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {holidays.map((h) => (
            <div key={h.id} className="rounded-md border border-border/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{h.name}</span>
                <Badge variant="outline" className="text-[10px]">{h.holiday_type}</Badge>
              </div>
              {h.description && (
                <p className="text-xs text-muted-foreground mt-1">{h.description}</p>
              )}
              {h.is_restricted && (
                <Badge variant="outline" className="mt-2 text-[10px]">Restricted holiday</Badge>
              )}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Please plan your work accordingly.</p>
        </div>
        <DialogFooter className="gap-2">
          <Button asChild variant="outline">
            <Link to="/hr?tab=holidays" onClick={dismiss}>View all holidays</Link>
          </Button>
          <Button onClick={dismiss}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
