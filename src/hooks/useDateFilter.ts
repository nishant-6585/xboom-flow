import { useState, useMemo } from "react";
import { startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay, format } from "date-fns";

export type DateRangePreset = "current_month" | "last_month" | "last_3_months" | "all" | "custom";

export interface UseDateFilterReturn {
  preset: DateRangePreset;
  setPreset: (p: DateRangePreset) => void;
  startDate: Date | undefined;
  endDate: Date | undefined;
  setStartDate: (d: Date | undefined) => void;
  setEndDate: (d: Date | undefined) => void;
  rangeLabel: string;
  inRange: (date: string | Date | null | undefined) => boolean;
}

export function useDateFilter(initial: DateRangePreset = "current_month"): UseDateFilterReturn {
  const [preset, setPresetState] = useState<DateRangePreset>(initial);
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    switch (preset) {
      case "current_month":
        return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
      case "last_month": {
        const lm = subMonths(now, 1);
        return { startDate: startOfMonth(lm), endDate: endOfMonth(lm) };
      }
      case "last_3_months":
        return { startDate: startOfMonth(subMonths(now, 2)), endDate: endOfMonth(now) };
      case "all":
        return { startDate: undefined, endDate: undefined };
      case "custom":
        return {
          startDate: customStart ? startOfDay(customStart) : undefined,
          endDate: customEnd ? endOfDay(customEnd) : undefined,
        };
    }
  }, [preset, customStart, customEnd]);

  const setPreset = (p: DateRangePreset) => {
    setPresetState(p);
    if (p !== "custom") {
      setCustomStart(undefined);
      setCustomEnd(undefined);
    }
  };

  const setStartDate = (d: Date | undefined) => {
    setPresetState("custom");
    setCustomStart(d);
  };
  const setEndDate = (d: Date | undefined) => {
    setPresetState("custom");
    setCustomEnd(d);
  };

  const rangeLabel = useMemo(() => {
    const now = new Date();
    switch (preset) {
      case "current_month":
        return format(now, "MMMM yyyy");
      case "last_month":
        return format(subMonths(now, 1), "MMMM yyyy");
      case "last_3_months":
        return "Last 3 Months";
      case "all":
        return "All Time";
      case "custom":
        if (startDate && endDate) {
          return `${format(startDate, "dd MMM")} – ${format(endDate, "dd MMM yyyy")}`;
        }
        return "Custom Range";
    }
  }, [preset, startDate, endDate]);

  const inRange = (date: string | Date | null | undefined) => {
    if (!date) return false;
    if (!startDate && !endDate) return true;
    const d = typeof date === "string" ? new Date(date) : date;
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  };

  return { preset, setPreset, startDate, endDate, setStartDate, setEndDate, rangeLabel, inRange };
}
