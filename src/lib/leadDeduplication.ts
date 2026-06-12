/**
 * Lead deduplication utility.
 *
 * Groups rows that look like duplicates of the same real-world lead.
 * Match keys (any one shared → same group):
 *   - normalized phone (digits only, last 10)
 *   - normalized email (lowercased, trimmed)
 *   - normalized company + name (lowercased, non-alphanum stripped)
 *
 * Pure / generic: the caller passes an accessor that returns the
 * identifying fields for each row, so the same util powers Enquiries,
 * Interakt leads, the Unified Inbox, etc.
 */

export interface DedupKeys {
  phone?: string | null;
  email?: string | null;
  name?: string | null;
  company?: string | null;
}

export interface DuplicateGroup<T> {
  /** Primary row to show in the table (newest by `getTimestamp`). */
  primary: T;
  /** Other rows that matched into the same group (oldest-first). */
  duplicates: T[];
  /** Total rows in the group, including the primary. */
  count: number;
  /** Stable key for React lists. */
  key: string;
}

function normalizePhone(v?: string | null): string | null {
  if (!v) return null;
  const digits = v.replace(/\D+/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-10);
}

function normalizeEmail(v?: string | null): string | null {
  if (!v) return null;
  const e = v.trim().toLowerCase();
  return e.length > 3 && e.includes("@") ? e : null;
}

function normalizeText(v?: string | null): string {
  if (!v) return "";
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function keysFor(input: DedupKeys): string[] {
  const out: string[] = [];
  const phone = normalizePhone(input.phone);
  if (phone) out.push(`p:${phone}`);
  const email = normalizeEmail(input.email);
  if (email) out.push(`e:${email}`);
  const company = normalizeText(input.company);
  const name = normalizeText(input.name);
  if (company && name && company.length >= 3) {
    out.push(`cn:${company}|${name}`);
  }
  return out;
}

/** Simple Union-Find. */
class DSU {
  parent = new Map<number, number>();
  find(x: number): number {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let p = this.parent.get(x)!;
    if (p === x) return x;
    p = this.find(p);
    this.parent.set(x, p);
    return p;
  }
  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export function groupDuplicates<T>(
  rows: T[],
  getKeys: (row: T) => DedupKeys,
  getTimestamp: (row: T) => string | number | Date | null | undefined,
  getId: (row: T, index: number) => string = (_r, i) => String(i),
): DuplicateGroup<T>[] {
  const dsu = new DSU();
  const keyToIdx = new Map<string, number>();

  rows.forEach((row, idx) => {
    dsu.find(idx); // ensure present
    const ks = keysFor(getKeys(row));
    for (const k of ks) {
      const existing = keyToIdx.get(k);
      if (existing === undefined) {
        keyToIdx.set(k, idx);
      } else {
        dsu.union(existing, idx);
      }
    }
  });

  // Bucket rows by root.
  const buckets = new Map<number, number[]>();
  rows.forEach((_row, idx) => {
    const root = dsu.find(idx);
    const list = buckets.get(root);
    if (list) list.push(idx);
    else buckets.set(root, [idx]);
  });

  const ts = (r: T) => {
    const v = getTimestamp(r);
    if (!v) return 0;
    const d = v instanceof Date ? v : new Date(v as string);
    const t = d.getTime();
    return Number.isFinite(t) ? t : 0;
  };

  const groups: DuplicateGroup<T>[] = [];
  for (const [, idxs] of buckets) {
    const sorted = idxs.slice().sort((a, b) => ts(rows[b]) - ts(rows[a]));
    const primaryIdx = sorted[0];
    const dupIdxs = sorted.slice(1).reverse(); // oldest-first for history view
    groups.push({
      primary: rows[primaryIdx],
      duplicates: dupIdxs.map((i) => rows[i]),
      count: sorted.length,
      key: `dup:${getId(rows[primaryIdx], primaryIdx)}`,
    });
  }

  // Stable order: newest primary first.
  groups.sort((a, b) => ts(b.primary) - ts(a.primary));
  return groups;
}

/** Convenience: just the deduplicated primaries. */
export function dedupePrimaries<T>(
  rows: T[],
  getKeys: (row: T) => DedupKeys,
  getTimestamp: (row: T) => string | number | Date | null | undefined,
): T[] {
  return groupDuplicates(rows, getKeys, getTimestamp).map((g) => g.primary);
}