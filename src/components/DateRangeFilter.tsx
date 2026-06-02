import { useState, useEffect } from 'react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, subDays, startOfDay, endOfDay, isSameDay } from 'date-fns';
import { CalendarIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface DateRangeFilterProps {
  startDate: Date | undefined;
  endDate: Date | undefined;
  onStartDateChange: (date: Date | undefined) => void;
  onEndDateChange: (date: Date | undefined) => void;
  onClear: () => void;
}

type Preset = { label: string; getRange: () => { start: Date | undefined; end: Date | undefined } };

const PRESETS: Preset[] = [
  { label: 'All Time', getRange: () => ({ start: undefined, end: undefined }) },
  { label: 'Today', getRange: () => { const t = startOfDay(new Date()); return { start: t, end: endOfDay(new Date()) }; } },
  { label: 'Yesterday', getRange: () => { const y = subDays(new Date(), 1); return { start: startOfDay(y), end: endOfDay(y) }; } },
  { label: 'This Week', getRange: () => ({ start: startOfWeek(new Date(), { weekStartsOn: 1 }), end: new Date() }) },
  { label: 'Last Week', getRange: () => { const s = startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }); return { start: s, end: endOfWeek(s, { weekStartsOn: 1 }) }; } },
  { label: 'This Month', getRange: () => ({ start: startOfMonth(new Date()), end: new Date() }) },
  { label: 'Last Month', getRange: () => { const lm = subMonths(new Date(), 1); return { start: startOfMonth(lm), end: endOfMonth(lm) }; } },
];

export function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClear,
}: DateRangeFilterProps) {
  const hasDateFilter = startDate || endDate;

  // Track the last preset the user clicked. This avoids ambiguity when two
  // presets resolve to the same range (e.g. early in a month, "This Week"
  // and "This Month" both start at the 1st and end today).
  const [lastClickedPreset, setLastClickedPreset] = useState<string | null>(null);

  // Reset memory if the dates no longer match the remembered preset (e.g.
  // user picked a custom date or cleared).
  useEffect(() => {
    if (!lastClickedPreset) return;
    const preset = PRESETS.find((p) => p.label === lastClickedPreset);
    if (!preset) return;
    const { start, end } = preset.getRange();
    const matches =
      (!start && !end && !startDate && !endDate) ||
      (!!start && !!end && !!startDate && !!endDate &&
        isSameDay(startDate, start) && isSameDay(endDate, end));
    if (!matches) setLastClickedPreset(null);
  }, [startDate, endDate, lastClickedPreset]);

  const activePresetIndex = (() => {
    // Prefer the explicitly clicked preset.
    if (lastClickedPreset) {
      const idx = PRESETS.findIndex((p) => p.label === lastClickedPreset);
      if (idx >= 0) return idx;
    }
    // Fallback: find any preset whose range matches (last match wins).
    for (let i = PRESETS.length - 1; i >= 0; i--) {
      const { start, end } = PRESETS[i].getRange();
      if (!start && !end) {
        if (!startDate && !endDate) return i;
        continue;
      }
      if (!startDate || !endDate) continue;
      if (isSameDay(startDate, start as Date) && isSameDay(endDate, end as Date)) return i;
    }
    return -1;
  })();

  const isPresetActive = (_preset: Preset, index: number) => index === activePresetIndex;

  const applyPreset = (preset: Preset) => {
    const { start, end } = preset.getRange();
    setLastClickedPreset(preset.label);
    onStartDateChange(start);
    onEndDateChange(end);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {PRESETS.map((p, i) => (
        <Button
          key={p.label}
          variant={isPresetActive(p, i) ? 'default' : 'outline'}
          size="sm"
          className={cn(
            "text-xs h-8",
            isPresetActive(p, i) && "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
          onClick={() => applyPreset(p)}
        >
          {p.label}
        </Button>
      ))}

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "justify-start text-left font-normal",
              !startDate && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {startDate ? format(startDate, "dd MMM yyyy") : "From"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={startDate}
            onSelect={onStartDateChange}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>

      <span className="text-muted-foreground text-sm">to</span>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "justify-start text-left font-normal",
              !endDate && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {endDate ? format(endDate, "dd MMM yyyy") : "To"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={endDate}
            onSelect={onEndDateChange}
            disabled={(date) => startDate ? date < startDate : false}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>

      {hasDateFilter && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-8 px-2"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
