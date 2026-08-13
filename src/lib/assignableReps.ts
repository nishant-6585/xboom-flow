// Fixed assignment pool shared by the MyOperator call-log and ManyChat lead
// tables — only these reps can be assigned. Match is case-insensitive and
// uses substring matching to handle minor name variations
// (e.g. "mohammed musthak" vs "Musthak").
export const ASSIGNABLE_REP_KEYWORDS = [
  "suman das",
  "narasimha",
  "musthak",
  "srishti",
  "manoj kumar",
];

export function isAssignableRepName(name: string | null | undefined): boolean {
  const n = (name || "").trim().toLowerCase();
  return n.length > 0 && ASSIGNABLE_REP_KEYWORDS.some((k) => n.includes(k));
}
