import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  subMonths,
  subDays,
  isSameDay,
  format,
  parse,
  isValid,
} from "date-fns";

export interface DateRange {
  start: Date | undefined;
  end: Date | undefined;
}

export interface PresetDef {
  label: string;
  getRange: () => DateRange;
}

// Kept in sync with DateRangeFilter's preset list so the "Active: " label
// on the Enquiries dashboard matches the preset the user actually clicked.
export const ENQUIRY_PRESETS: PresetDef[] = [
  { label: "All Time", getRange: () => ({ start: undefined, end: undefined }) },
  {
    label: "Today",
    getRange: () => ({ start: startOfDay(new Date()), end: endOfDay(new Date()) }),
  },
  {
    label: "Yesterday",
    getRange: () => {
      const y = subDays(new Date(), 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    },
  },
  {
    label: "This Week",
    getRange: () => ({
      start: startOfWeek(new Date(), { weekStartsOn: 1 }),
      end: new Date(),
    }),
  },
  {
    label: "Last Week",
    getRange: () => {
      const s = startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
      return { start: s, end: endOfWeek(s, { weekStartsOn: 1 }) };
    },
  },
  {
    label: "This Month",
    getRange: () => ({ start: startOfMonth(new Date()), end: new Date() }),
  },
  {
    label: "Last Month",
    getRange: () => {
      const lm = subMonths(new Date(), 1);
      return { start: startOfMonth(lm), end: endOfMonth(lm) };
    },
  },
];

/**
 * Human-readable label for a currently-applied range. Falls back to a
 * formatted custom range like "12 Jul – 15 Jul 2026" when no preset matches.
 */
export function getActivePresetLabel(start: Date | undefined, end: Date | undefined): string {
  for (const p of ENQUIRY_PRESETS) {
    const r = p.getRange();
    if (!r.start && !r.end) {
      if (!start && !end) return p.label;
      continue;
    }
    if (!start || !end || !r.start || !r.end) continue;
    if (isSameDay(start, r.start) && isSameDay(end, r.end)) return p.label;
  }
  if (start && end) return `${format(start, "dd MMM")} – ${format(end, "dd MMM yyyy")}`;
  if (start) return `From ${format(start, "dd MMM yyyy")}`;
  if (end) return `Until ${format(end, "dd MMM yyyy")}`;
  return "All Time";
}

// ---------------------------------------------------------------------------
// Persistence — stored as calendar-day strings (YYYY-MM-DD) to avoid the
// off-by-one drift that happens when ISO/UTC timestamps are round-tripped in
// a different local timezone. On read we reconstruct with startOfDay /
// endOfDay so filter comparisons remain timezone-consistent.
// ---------------------------------------------------------------------------

export interface StoredRange {
  start: string | null; // YYYY-MM-DD in local calendar
  end: string | null;
}

export function serializeRange(start: Date | undefined, end: Date | undefined): StoredRange {
  return {
    start: start ? format(start, "yyyy-MM-dd") : null,
    end: end ? format(end, "yyyy-MM-dd") : null,
  };
}

export function parseRange(raw: string | null | undefined): DateRange {
  if (!raw) return { start: undefined, end: undefined };
  try {
    const parsed = JSON.parse(raw) as Partial<StoredRange>;
    const parseDay = (v: string | null | undefined, edge: "start" | "end") => {
      if (!v) return undefined;
      const d = parse(v, "yyyy-MM-dd", new Date());
      if (!isValid(d)) return undefined;
      return edge === "start" ? startOfDay(d) : endOfDay(d);
    };
    return {
      start: parseDay(parsed.start, "start"),
      end: parseDay(parsed.end, "end"),
    };
  } catch {
    return { start: undefined, end: undefined };
  }
}

export function enquiryDateStorageKey(userId: string | null | undefined): string {
  const uid = userId && userId.length > 0 ? userId : "anon";
  return `xboom.enquiries.dateFilter.v2.${uid}`;
}

export function topDateStorageKey(userId: string | null | undefined): string {
  const uid = userId && userId.length > 0 ? userId : "anon";
  return `xboom.enquiries.topDateFilter.v2.${uid}`;
}