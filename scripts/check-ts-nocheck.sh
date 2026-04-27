#!/usr/bin/env bash
# Guard: warn if `@ts-nocheck` appears in any edge function outside the approved allowlist.
#
# Approved files (temporarily exempt due to Supabase Deno SDK type inference issue):
#   - supabase/functions/ai-email-lead-processor/index.ts
#   - supabase/functions/ai-portal-assistant/index.ts
#   - supabase/functions/analyze-ticket/index.ts
#   - supabase/functions/attendance-nudge/index.ts
#
# Usage: bash scripts/check-ts-nocheck.sh
# Exits 1 if any unapproved file uses @ts-nocheck.

set -euo pipefail

ALLOWLIST=(
  "supabase/functions/ai-email-lead-processor/index.ts"
  "supabase/functions/ai-portal-assistant/index.ts"
  "supabase/functions/analyze-ticket/index.ts"
  "supabase/functions/attendance-nudge/index.ts"
)

is_allowed() {
  local f="$1"
  for a in "${ALLOWLIST[@]}"; do
    [[ "$f" == "$a" ]] && return 0
  done
  return 1
}

violations=()
while IFS= read -r file; do
  if ! is_allowed "$file"; then
    violations+=("$file")
  fi
done < <(grep -rl "@ts-nocheck" supabase/functions/ 2>/dev/null || true)

if (( ${#violations[@]} > 0 )); then
  echo "❌ @ts-nocheck found in unapproved edge function(s):"
  printf '   - %s\n' "${violations[@]}"
  echo
  echo "Fix the underlying types instead of suppressing them."
  echo "If you must add a new exemption, update ALLOWLIST in scripts/check-ts-nocheck.sh"
  echo "and document the reason in the file header."
  exit 1
fi

echo "✅ @ts-nocheck usage is within the approved allowlist."