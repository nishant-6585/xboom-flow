/**
 * Multi-segment pro-rated salary calculation for employment transitions
 * (e.g., Intern → Full-Time mid-month).
 */

export type EmploymentSegment = {
  from: Date;
  to: Date;
  type: 'INTERN' | 'FULL_TIME' | 'CONTRACT';
  salary?: number;
  stipend?: number;
};

/**
 * Calculate pro-rated salary across multiple employment segments in a month.
 * 
 * @param segments - Array of employment segments within the month
 * @param totalDaysInMonth - Total calendar days in the month (30/31)
 * @param lopDays - Loss of Pay days to deduct (distributed proportionally)
 * @returns The total pro-rated salary
 */
export function calculateSegmentedSalary(
  segments: EmploymentSegment[],
  totalDaysInMonth: number,
  lopDays: number = 0
): number {
  if (segments.length === 0 || totalDaysInMonth <= 0) return 0;

  let total = 0;
  const totalSegmentDays = segments.reduce((sum, seg) => {
    const days = daysBetween(seg.from, seg.to);
    return sum + days;
  }, 0);

  segments.forEach(seg => {
    const segDays = daysBetween(seg.from, seg.to);
    const base = seg.type === 'INTERN' ? (seg.stipend ?? 0) : (seg.salary ?? 0);
    const perDay = base / totalDaysInMonth;

    // Distribute LOP proportionally across segments
    const segLop = totalSegmentDays > 0
      ? Math.round((segDays / totalSegmentDays) * lopDays * 100) / 100
      : 0;

    const adjustedDays = Math.max(segDays - segLop, 0);
    total += perDay * adjustedDays;
  });

  return Math.round(total * 100) / 100;
}

/**
 * Count calendar days between two dates (inclusive).
 */
function daysBetween(from: Date, to: Date): number {
  if (from > to) return 0;
  const diffMs = to.getTime() - from.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Build employment segments for a given month from employment_history records.
 */
export function buildSegmentsForMonth(
  history: Array<{
    employment_type: string;
    salary: number | null;
    stipend: number | null;
    effective_from: string;
    effective_to: string | null;
  }>,
  monthStart: Date,
  monthEnd: Date
): EmploymentSegment[] {
  const segments: EmploymentSegment[] = [];

  for (const record of history) {
    const recStart = new Date(record.effective_from);
    const recEnd = record.effective_to ? new Date(record.effective_to) : monthEnd;

    // Calculate overlap with month
    const overlapStart = recStart > monthStart ? recStart : monthStart;
    const overlapEnd = recEnd < monthEnd ? recEnd : monthEnd;

    if (overlapStart > overlapEnd) continue;

    segments.push({
      from: overlapStart,
      to: overlapEnd,
      type: record.employment_type as EmploymentSegment['type'],
      salary: record.salary ?? undefined,
      stipend: record.stipend ?? undefined,
    });
  }

  // Sort by start date
  segments.sort((a, b) => a.from.getTime() - b.from.getTime());
  return segments;
}
