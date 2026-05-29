import { cn } from "@/lib/utils";

/**
 * Returns Tailwind classes for visually marking a lead row as touched/untouched.
 * Touched -> green left border + subtle green tint.
 * Untouched -> red left border + subtle red tint.
 * Designed to be merged with any existing row className via cn().
 */
export function touchedRowClass(touched: boolean): string {
  return touched
    ? "border-l-4 border-l-green-500 bg-green-500/5 hover:bg-green-500/10"
    : "border-l-4 border-l-red-500 bg-red-500/5 hover:bg-red-500/10";
}

export const touchedRowCn = (touched: boolean, ...extra: (string | undefined | false | null)[]) =>
  cn(touchedRowClass(touched), ...extra);

/** Generic per-source "touched" predicate mirroring useTouchedStats logic. */
export function isRowTouched(
  source:
    | "enquiries"
    | "qforms"
    | "form-leads"
    | "interakt"
    | "myoperator"
    | "elevenlabs"
    | "emails"
    | "google-ads"
    | "xboom-website",
  r: any,
  engagedIds?: Set<string>,
): boolean {
  if (engagedIds && engagedIds.has(String(r?.id))) return true;
  const norm = (s?: string | null) => (s ?? "").trim();
  switch (source) {
    case "enquiries":
      return (
        (r.status && r.status !== "pending") ||
        !!norm(r.notes) ||
        !!r.response_notes ||
        !!r.lost_reason_notes ||
        !!r.outcome_updated_at
      );
    case "qforms":
    case "form-leads":
      return (r.status && r.status !== "new") || !!norm(r.notes) || !!norm(r.message);
    case "interakt":
      return (
        (r.status && r.status !== "new") ||
        !!norm(r.notes) ||
        r.is_prospect === true ||
        r.is_a_category === true ||
        r.is_enquiry_converted === true ||
        !!norm(r.updated_by)
      );
    case "myoperator":
    case "elevenlabs":
      return (
        (r.lead_status && r.lead_status !== "New") ||
        !!norm(r.notes) ||
        r.lead_created === true
      );
    case "emails":
      return (r.status && r.status !== "pending") || !!norm(r.notes);
    case "google-ads":
      return (r.status && r.status !== "pending") || !!norm(r.notes);
    case "xboom-website":
      return (
        !!norm(r.internal_notes) ||
        !!norm(r.sales_notes) ||
        (r.order_status && !["pending", "processing"].includes(r.order_status))
      );
  }
  return false;
}