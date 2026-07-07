import { useEffect, useState } from "react";
import { Cake, PartyPopper } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";

interface Birthday {
  employee_id: string;
  name: string;
  department: string | null;
  avatar_url: string | null;
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
      const { data, error } = await supabase.rpc("get_todays_birthdays");
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

  // Render nothing (no empty shell) when loading or when zero birthdays today.
  if (!rows || rows.length === 0) return null;

  const dateKey = istDateKey();

  return (
    <Card className="border-pink-200/60 bg-gradient-to-br from-pink-50 via-amber-50 to-white dark:from-pink-950/30 dark:via-amber-950/20 dark:to-background overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-pink-500/10 text-pink-600 dark:text-pink-400">
            <Cake className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-sm leading-tight">
              {rows.length === 1 ? "Birthday today" : `${rows.length} birthdays today`}
            </h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <PartyPopper className="w-3 h-3" /> Send them some love
            </p>
          </div>
        </div>
        <ul className="space-y-3">
          {rows.map((b) => (
            <li key={b.employee_id} className="flex items-start gap-3">
              <Avatar className="w-9 h-9 shrink-0 ring-2 ring-pink-200/60 dark:ring-pink-900/40">
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
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {pickWish(b.employee_id, dateKey)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default BirthdayCard;