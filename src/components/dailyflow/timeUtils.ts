const TIME_24H_REGEX = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function normalizeFlexibleTimeInput(value: string): string | null {
  const input = value.trim().toLowerCase();

  if (!input) return null;

  const normalized = input.replace(/\./g, ':').replace(/\s+/g, ' ');
  const exact24h = normalized.match(TIME_24H_REGEX);
  if (exact24h) {
    return `${exact24h[1].padStart(2, '0')}:${exact24h[2]}`;
  }

  const ampmMatch = normalized.match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm)$/i);
  if (ampmMatch) {
    let hours = Number(ampmMatch[1]);
    const minutes = Number(ampmMatch[2] ?? '0');
    const meridiem = ampmMatch[3];

    if (hours < 1 || hours > 12 || minutes > 59) return null;

    if (meridiem === 'am') {
      hours = hours === 12 ? 0 : hours;
    } else {
      hours = hours === 12 ? 12 : hours + 12;
    }

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  const compactMatch = normalized.match(/^(\d{1,2})(\d{2})$/);
  if (compactMatch) {
    const hours = Number(compactMatch[1]);
    const minutes = Number(compactMatch[2]);
    if (hours > 23 || minutes > 59) return null;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  const hourOnlyMatch = normalized.match(/^(\d{1,2})$/);
  if (hourOnlyMatch) {
    const hours = Number(hourOnlyMatch[1]);
    if (hours > 23) return null;
    return `${String(hours).padStart(2, '0')}:00`;
  }

  return null;
}

export function calculateDurationMinutes(timeFrom: string, timeTo: string): number {
  const from = normalizeFlexibleTimeInput(timeFrom);
  const to = normalizeFlexibleTimeInput(timeTo);

  if (!from || !to) return 0;

  const [fromHours, fromMinutes] = from.split(':').map(Number);
  const [toHours, toMinutes] = to.split(':').map(Number);
  const diff = toHours * 60 + toMinutes - (fromHours * 60 + fromMinutes);

  return diff > 0 ? diff : 0;
}

export function isValidNormalizedTime(value: string): boolean {
  return TIME_24H_REGEX.test(value);
}