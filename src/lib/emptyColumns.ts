/**
 * Helpers for hiding table columns that carry no information for the
 * currently visible rows. Printing "—" or "No enquiry text" fifty times
 * down a column tells the reader nothing fifty times.
 */
export function anyValue<T>(rows: T[], getter: (row: T) => unknown): boolean {
  return rows.some((row) => {
    const v = getter(row);
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim().length > 0;
    return true;
  });
}
