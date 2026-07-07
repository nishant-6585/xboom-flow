import { useEffect, useState } from "react";
import { Cake, PartyPopper, Gift } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";

interface Birthday {
  employee_id: string;
  name: string;
  department: string | null;
  avatar_url: string | null;
  birth_month: number;
  birth_day: number;
}

// Pool of ~15 short, warm birthday wishes (varied tone, no age/year references).
export const BIRTHDAY_WISHES = [
  "Wishing you a wonderful year ahead! 🎂",
  "May your day be filled with joy and cake!",
  "Happy Birthday! Here's to another great year.",
  "Cheers to you today — enjoy every moment!",
  "Sending you warm wishes on your special day.",
  "Have a fantastic birthday and a brilliant year!",
  "Hope today brings you all the happiness you deserve.",
  "Wishing you smiles, laughter, and lots of cake today!",
  "Happy Birthday! May all your plans take off this year.",
  "A whole new chapter begins — make it a great one!",
  "Warmest wishes on your birthday from the whole team.",
  "Have a birthday as awesome as you are.",
  "May this year bring you fresh wins and good vibes.",
  "Celebrate big — you've earned it!",
  "Happy Birthday! Team Xboom is cheering for you today.",
];

// Stable hash of (employeeId + IST date) → index into wish pool.
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}

function istDateKey(): string {
  // YYYY-MM-DD in IST — matches server-side (Asia/Kolkata) day boundary.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function istTodayParts(): { month: number; day: number; monthName: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    month: "numeric",
    day: "numeric",
  });
  const parts = fmt.formatToParts(new Date());
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "0");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "0");
  const monthName = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    month: "long",
  }).format(new Date());
  return { month, day, monthName };
}

function formatDay(month: number, day: number): string {
  // Build a stable date in current year purely for label formatting (IST-safe).
  const d = new Date(Date.UTC(2000, month - 1, day));
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

export function pickWish(employeeId: string, dateKey: string, pool: string[] = BIRTHDAY_WISHES): string {
  const idx = hashString(`${employeeId}|${dateKey}`) % pool.length;
  return pool[idx];
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function BirthdayCard() {
  const [rows, setRows] = useState<Birthday[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_current_month_birthdays");
      if (cancelled) return;
      if (error) {
        setRows([]);
        return;
      }
      setRows((data as Birthday[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Render nothing (no empty shell) when loading or when zero birthdays this month.
  if (!rows || rows.length === 0) return null;

  const dateKey = istDateKey();
  const { month: todayMonth, day: todayDay, monthName } = istTodayParts();
  const todaysCount = rows.filter((r) => r.birth_month === todayMonth && r.birth_day === todayDay).length;

  return (
    <Card className="border-pink-200/60 bg-gradient-to-br from-pink-50 via-amber-50 to-white dark:from-pink-950/30 dark:via-amber-950/20 dark:to-background overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-pink-500/10 text-pink-600 dark:text-pink-400">
            <Cake className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-sm leading-tight">
              Birthdays in {monthName}
            </h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <PartyPopper className="w-3 h-3" />
              {todaysCount > 0
                ? `${todaysCount} celebrating today — send them some love`
                : `${rows.length} teammate${rows.length === 1 ? "" : "s"} to cheer this month`}
            </p>
          </div>
        </div>
        <ul className="space-y-3">
          {rows.map((b) => {
            const isToday = b.birth_month === todayMonth && b.birth_day === todayDay;
            return (
            <li key={b.employee_id} className="flex items-start gap-3">
              <Avatar
                className={
                  "w-9 h-9 shrink-0 ring-2 " +
                  (isToday
                    ? "ring-pink-500/70 dark:ring-pink-400/70"
                    : "ring-pink-200/60 dark:ring-pink-900/40")
                }
              >
                {b.avatar_url ? <AvatarImage src={b.avatar_url} alt={b.name} /> : null}
                <AvatarFallback className="text-xs bg-pink-500/10 text-pink-700 dark:text-pink-300">
                  {initialsOf(b.name) || "🎂"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <p className="font-medium text-sm truncate">{b.name}</p>
                  {b.department && (
                    <span className="text-[11px] text-muted-foreground">· {b.department}</span>
                  )}
                  <span
                    className={
                      "text-[11px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 " +
                      (isToday
                        ? "bg-pink-500 text-white"
                        : "bg-pink-500/10 text-pink-700 dark:text-pink-300")
                    }
                  >
                    {isToday ? <Gift className="w-3 h-3" /> : null}
                    {isToday ? "Today" : formatDay(b.birth_month, b.birth_day)}
                  </span>
                </div>
                {isToday && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {pickWish(b.employee_id, dateKey)}
                  </p>
                )}
              </div>
            </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

export default BirthdayCard;