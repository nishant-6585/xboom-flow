import { differenceInCalendarDays, addDays, startOfDay } from "date-fns";

export type AgingBucket = "current" | "0-30" | "31-60" | "61-90" | "90+";

export interface AgingItem {
  id: string;
  number: string;
  date: string; // ISO
  due_date: string; // ISO
  total: number;
  outstanding: number;
  daysOverdue: number;
  bucket: AgingBucket;
  status?: string | null;
}

export interface AgingRow {
  name: string;
  counterpartyId?: string;
  current: number;
  bucket_0_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90_plus: number;
  total: number;
  items: AgingItem[];
}

export interface AgingTotals {
  current: number;
  bucket_0_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90_plus: number;
  grand: number;
}

export interface AgingKpis {
  totalOutstanding: number;
  totalOverdue: number;
  overdue90PlusCount: number;
  overdue90PlusValue: number;
  averageDaysOverdue: number;
  counterpartiesWithOverdue: number;
}

export interface AgingResult {
  kpis: AgingKpis;
  matrix: AgingRow[];
  totals: AgingTotals;
}

export const DEFAULT_TERMS_DAYS = 30;

export function bucketize(
  invoiceDate: string,
  dueDate: string | null,
  asOfDate: Date,
): { daysOverdue: number; bucket: AgingBucket; effectiveDue: string } {
  const asOf = startOfDay(asOfDate);
  const due = dueDate
    ? startOfDay(new Date(dueDate))
    : addDays(startOfDay(new Date(invoiceDate)), DEFAULT_TERMS_DAYS);
  const days = differenceInCalendarDays(asOf, due);
  const daysOverdue = Math.max(0, days);
  let bucket: AgingBucket = "current";
  if (daysOverdue <= 0) bucket = "current";
  else if (daysOverdue <= 30) bucket = "0-30";
  else if (daysOverdue <= 60) bucket = "31-60";
  else if (daysOverdue <= 90) bucket = "61-90";
  else bucket = "90+";
  return { daysOverdue, bucket, effectiveDue: due.toISOString().slice(0, 10) };
}

export function emptyResult(): AgingResult {
  return {
    kpis: {
      totalOutstanding: 0,
      totalOverdue: 0,
      overdue90PlusCount: 0,
      overdue90PlusValue: 0,
      averageDaysOverdue: 0,
      counterpartiesWithOverdue: 0,
    },
    matrix: [],
    totals: {
      current: 0,
      bucket_0_30: 0,
      bucket_31_60: 0,
      bucket_61_90: 0,
      bucket_90_plus: 0,
      grand: 0,
    },
  };
}

export function aggregate(items: Array<AgingItem & { groupName: string; groupId?: string }>): AgingResult {
  const groups = new Map<string, AgingRow>();
  for (const it of items) {
    if (it.outstanding <= 0) continue;
    const key = it.groupName.trim() || "(Unknown)";
    let row = groups.get(key);
    if (!row) {
      row = {
        name: key,
        counterpartyId: it.groupId,
        current: 0,
        bucket_0_30: 0,
        bucket_31_60: 0,
        bucket_61_90: 0,
        bucket_90_plus: 0,
        total: 0,
        items: [],
      };
      groups.set(key, row);
    }
    row.items.push(it);
    row.total += it.outstanding;
    switch (it.bucket) {
      case "current": row.current += it.outstanding; break;
      case "0-30": row.bucket_0_30 += it.outstanding; break;
      case "31-60": row.bucket_31_60 += it.outstanding; break;
      case "61-90": row.bucket_61_90 += it.outstanding; break;
      case "90+": row.bucket_90_plus += it.outstanding; break;
    }
  }

  const matrix = Array.from(groups.values()).sort((a, b) => b.total - a.total);

  const totals: AgingTotals = {
    current: 0,
    bucket_0_30: 0,
    bucket_31_60: 0,
    bucket_61_90: 0,
    bucket_90_plus: 0,
    grand: 0,
  };
  let weightedDays = 0;
  let overdueValue = 0;
  let overdue90Count = 0;
  let overdue90Value = 0;
  const overdueCounterparties = new Set<string>();
  for (const row of matrix) {
    totals.current += row.current;
    totals.bucket_0_30 += row.bucket_0_30;
    totals.bucket_31_60 += row.bucket_31_60;
    totals.bucket_61_90 += row.bucket_61_90;
    totals.bucket_90_plus += row.bucket_90_plus;
    totals.grand += row.total;
    const rowOverdue =
      row.bucket_0_30 + row.bucket_31_60 + row.bucket_61_90 + row.bucket_90_plus;
    if (rowOverdue > 0) overdueCounterparties.add(row.name);
    for (const it of row.items) {
      if (it.daysOverdue > 0) {
        weightedDays += it.daysOverdue * it.outstanding;
        overdueValue += it.outstanding;
        if (it.bucket === "90+") {
          overdue90Count += 1;
          overdue90Value += it.outstanding;
        }
      }
    }
  }

  return {
    matrix,
    totals,
    kpis: {
      totalOutstanding: totals.grand,
      totalOverdue: overdueValue,
      overdue90PlusCount: overdue90Count,
      overdue90PlusValue: overdue90Value,
      averageDaysOverdue: overdueValue > 0 ? weightedDays / overdueValue : 0,
      counterpartiesWithOverdue: overdueCounterparties.size,
    },
  };
}