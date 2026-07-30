/** Minimal cron helper for displaying the next run of the pricelist reconcile
 *  job. Supports the standard 5-field syntax with numbers, '*', lists and
 *  step values — enough for the schedules used by our jobs. */
function matches(field: string, value: number): boolean {
  if (field === '*') return true;
  return field.split(',').some((part) => {
    const [range, stepRaw] = part.split('/');
    const step = stepRaw ? parseInt(stepRaw, 10) : 1;
    if (range === '*') return value % step === 0;
    const [a, b] = range.split('-').map((n) => parseInt(n, 10));
    const end = Number.isFinite(b) ? b : a;
    if (value < a || value > end) return false;
    return (value - a) % step === 0;
  });
}

/** Next UTC-based occurrence of a cron expression, or null if unparseable. */
export function nextCronRun(expr: string | null | undefined, from: Date = new Date()): Date | null {
  if (!expr) return null;
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return null;
  const [min, hour, dom, mon, dow] = f;
  const d = new Date(from.getTime());
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(d.getUTCMinutes() + 1);
  for (let i = 0; i < 60 * 24 * 366; i++) {
    if (
      matches(min, d.getUTCMinutes()) &&
      matches(hour, d.getUTCHours()) &&
      matches(dom, d.getUTCDate()) &&
      matches(mon, d.getUTCMonth() + 1) &&
      matches(dow, d.getUTCDay())
    ) return d;
    d.setUTCMinutes(d.getUTCMinutes() + 1);
  }
  return null;
}
