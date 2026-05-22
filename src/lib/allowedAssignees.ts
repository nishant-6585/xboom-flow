/**
 * Centralized allow-list for "Assigned To" dropdowns across all lead-source panels.
 * Only these 6 reps may receive lead assignments from the UI.
 *
 * Matching is case-insensitive substring on the user's profile name, so we
 * tolerate small spelling variations (e.g. "Narsimha" vs "Narasimha",
 * "Mushtaq" vs "Musthak", "Suman Das" vs "Suman").
 */
export const ALLOWED_ASSIGNEE_KEYWORDS = [
  "suman",        // Suman Das
  "narasimha",    // also matches "narsimha"
  "narsimha",
  "musthak",      // Mohammed Musthak
  "mushtaq",
  "arjav",        // Arjav Chauhan
  "srishti",      // Srishti Suman
  "manoj",        // Manoj Kumar
] as const;

export function isAllowedAssignee(name?: string | null): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return ALLOWED_ASSIGNEE_KEYWORDS.some((k) => n.includes(k));
}

export function filterAllowedAssignees<T extends { name?: string | null }>(users: T[]): T[] {
  return users.filter((u) => isAllowedAssignee(u.name));
}