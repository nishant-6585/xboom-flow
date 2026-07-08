// Pure validators for manual KYC uploads. Shared between the edge function
// (Deno) and vitest unit tests (Node). Keep this file dependency-free.

export type ManualDocType =
  | "aadhaar" | "pan" | "driving_license" | "voter_id"
  | "passport" | "rental_agreement" | "other_gov_id";

export const MANUAL_DOC_TYPES: ManualDocType[] = [
  "aadhaar", "pan", "driving_license", "voter_id",
  "passport", "rental_agreement", "other_gov_id",
];

export interface ValidatedManualInput {
  aadhaarFull: string | null;
  documentReference: string | null;
}

/**
 * Returns null on success (with normalized fields via out-parameter),
 * or a human-readable error message on failure.
 */
export function validateManualInput(
  docType: string,
  rawNumber: string,
): { error: string } | { ok: true; value: ValidatedManualInput } {
  if (!MANUAL_DOC_TYPES.includes(docType as ManualDocType)) {
    return { error: "Invalid document_type" };
  }
  const t = docType as ManualDocType;
  const raw = (rawNumber ?? "").trim();
  const cleaned = raw.replace(/\s+/g, "");
  const upper = cleaned.toUpperCase();

  switch (t) {
    case "aadhaar":
      if (!/^\d{12}$/.test(cleaned)) return { error: "Aadhaar must be exactly 12 digits" };
      return { ok: true, value: { aadhaarFull: cleaned, documentReference: null } };
    case "pan":
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(upper)) return { error: "PAN must be in format AAAAA9999A" };
      return { ok: true, value: { aadhaarFull: null, documentReference: upper } };
    case "driving_license":
      if (!/^[A-Z0-9\-\s]{5,20}$/i.test(raw)) return { error: "Driving Licence number looks invalid" };
      return { ok: true, value: { aadhaarFull: null, documentReference: raw.toUpperCase() } };
    case "passport":
      if (!/^[A-PR-WYa-pr-wy][0-9]{7}$/.test(raw)) return { error: "Passport must be 1 letter + 7 digits" };
      return { ok: true, value: { aadhaarFull: null, documentReference: raw.toUpperCase() } };
    case "voter_id":
      if (!/^[A-Z0-9]{6,20}$/i.test(raw)) return { error: "Voter ID looks invalid" };
      return { ok: true, value: { aadhaarFull: null, documentReference: raw.toUpperCase() } };
    case "rental_agreement":
    case "other_gov_id":
      return {
        ok: true,
        value: { aadhaarFull: null, documentReference: raw ? raw.slice(0, 120) : null },
      };
  }
}
