// Fixed assignment pool for MyOperator call leads — the edge-function mirror of
// src/lib/assignableReps.ts. Keep the two lists in sync.
//
// This exists because `role = 'sales'` is a much wider set than the reps who
// should actually receive call leads: support staff, managers and non-selling
// users carry the role too. Assigning from the raw role query is what put call
// leads on people who never work them.
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
