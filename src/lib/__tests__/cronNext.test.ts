import { describe, it, expect } from 'vitest';
import { nextCronRun } from '@/lib/cronNext';

describe('nextCronRun', () => {
  it('resolves a daily schedule', () => {
    const next = nextCronRun('30 1 * * *', new Date('2026-07-30T10:00:00Z'))!;
    expect(next.toISOString()).toBe('2026-07-31T01:30:00.000Z');
  });
  it('resolves a step schedule', () => {
    const next = nextCronRun('*/15 * * * *', new Date('2026-07-30T10:02:00Z'))!;
    expect(next.toISOString()).toBe('2026-07-30T10:15:00.000Z');
  });
  it('returns null for bad input', () => {
    expect(nextCronRun('nope')).toBeNull();
    expect(nextCronRun(null)).toBeNull();
  });
});
