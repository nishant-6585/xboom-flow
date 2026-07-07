import { useEffect, useState } from "react";
import { Cake, PartyPopper, Gift, Sparkles, Megaphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface NextBirthday {
  employee_id: string;
  name: string;
  department: string | null;
  birth_month: number;
  birth_day: number;
  days_until: number;
  is_today: boolean;
  is_owner: boolean;
  is_flashed: boolean;
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
  const [row, setRow] = useState<NextBirthday | null | undefined>(undefined);
  const [revealed, setRevealed] = useState(false);
  const [flashing, setFlashing] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.rpc("get_next_birthday" as never);
    if (error) {
      setRow(null);
      return;
    }
    const arr = (data as unknown as NextBirthday[]) ?? [];
    setRow(arr[0] ?? null);
  };

  useEffect(() => {
    void load();
  }, []);

  if (row === undefined) return null; // loading
  if (row === null) return null; // no upcoming birthday (shouldn't happen if active employees have dob)

  const dateKey = istDateKey();
  const wish = pickWish(row.employee_id, dateKey);
  const dayLabel = formatDay(row.birth_month, row.birth_day);
  const showMessage = row.is_today && (row.is_flashed || (row.is_owner && revealed));

  const handleFlash = async () => {
    setFlashing(true);
    const { error } = await supabase.rpc("flash_my_birthday" as never);
    setFlashing(false);
    if (error) {
      toast.error("Couldn't flash your birthday", { description: error.message });
      return;
    }
    toast.success("Your birthday wish is now live on the team dashboard 🎉");
    void load();
  };

  return (
    <Card className="border-pink-200/60 bg-gradient-to-br from-pink-50 via-amber-50 to-white dark:from-pink-950/30 dark:via-amber-950/20 dark:to-background overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-pink-500/10 text-pink-600 dark:text-pink-400">
            <Cake className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-sm leading-tight">
              {row.is_today ? "Birthday today" : "Upcoming birthday"}
            </h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <PartyPopper className="w-3 h-3" />
              {row.is_today
                ? "Send them some love"
                : row.days_until === 1
                  ? "Tomorrow — get ready to cheer!"
                  : `In ${row.days_until} days`}
            </p>
          </div>
        </div>

        {/* Owner-on-birthday: hidden surprise until they click */}
        {row.is_today && row.is_owner && !revealed && !row.is_flashed ? (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="w-full text-left rounded-lg border border-dashed border-pink-400/60 bg-pink-500/5 hover:bg-pink-500/10 transition p-4 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-pink-500 text-white flex items-center justify-center shadow-sm">
              <Gift className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm">You have a surprise 🎁</p>
              <p className="text-xs text-muted-foreground">Tap to open your birthday message</p>
            </div>
          </button>
        ) : (
          <div className="flex items-start gap-3">
            <Avatar className="w-11 h-11 shrink-0 ring-2 ring-pink-500/60">
              <AvatarFallback className="text-sm bg-pink-500/10 text-pink-700 dark:text-pink-300">
                {initialsOf(row.name) || "🎂"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="font-semibold text-sm truncate">{row.name}</p>
                {row.department && (
                  <span className="text-[11px] text-muted-foreground">· {row.department}</span>
                )}
                <span
                  className={
                    "text-[11px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 " +
                    (row.is_today
                      ? "bg-pink-500 text-white"
                      : "bg-pink-500/10 text-pink-700 dark:text-pink-300")
                  }
                >
                  {row.is_today ? <Gift className="w-3 h-3" /> : null}
                  {row.is_today ? "Today" : dayLabel}
                </span>
              </div>

              {row.is_today && !showMessage && !row.is_owner && (
                <p className="text-xs text-muted-foreground mt-1">
                  It's {row.name.split(" ")[0]}'s big day — drop them a wish!
                </p>
              )}

              {showMessage && (
                <div className="mt-2 rounded-md bg-white/60 dark:bg-white/5 border border-pink-200/50 dark:border-pink-900/40 p-2.5">
                  <p className="text-sm flex items-start gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-pink-500 mt-0.5 shrink-0" />
                    <span>{wish}</span>
                  </p>
                  {row.is_flashed && (
                    <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                      <Megaphone className="w-3 h-3" /> Shared with the team
                    </p>
                  )}
                </div>
              )}

              {/* Owner controls after reveal */}
              {row.is_today && row.is_owner && revealed && !row.is_flashed && (
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" onClick={handleFlash} disabled={flashing} className="h-8">
                    <Megaphone className="w-3.5 h-3.5 mr-1.5" />
                    {flashing ? "Sharing…" : "Flash on team dashboard"}
                  </Button>
                  <span className="text-[11px] text-muted-foreground">Optional</span>
                </div>
              )}

              {!row.is_today && (
                <p className="text-xs text-muted-foreground mt-1">
                  Get ready — {row.name.split(" ")[0]}'s birthday is on {dayLabel}.
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default BirthdayCard;