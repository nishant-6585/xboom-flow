import { z } from 'zod';

/** Field path (`items.0.quantity`) → first error message for that field. */
export type FieldErrors = Record<string, string>;

/**
 * Flatten a ZodError into a path-keyed map the step forms can index directly.
 * Only the first message per field is kept — showing three complaints about one
 * input is noise.
 */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors: FieldErrors;
}

/**
 * Run a schema and return path-keyed errors instead of throwing.
 *
 * Generic over the schema rather than its output type: several of these schemas
 * transform (numeric strings -> numbers), so input and output differ and
 * `z.ZodType<T>` would not accept them.
 */
export function validate<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown
): ValidationResult<z.infer<S>> {
  const result = schema.safeParse(value);
  if (result.success) return { success: true, data: result.data, errors: {} };
  return { success: false, errors: toFieldErrors(result.error) };
}

/**
 * Errors that belong to the fields a given step owns, so step 1 does not light
 * up because step 3 is incomplete.
 */
export function errorsForFields(errors: FieldErrors, prefixes: string[]): FieldErrors {
  return Object.fromEntries(
    Object.entries(errors).filter(([key]) =>
      prefixes.some(prefix => key === prefix || key.startsWith(`${prefix}.`))
    )
  );
}

/** First error message in a set, for a summary line. */
export function firstError(errors: FieldErrors): string | null {
  const values = Object.values(errors);
  return values.length > 0 ? values[0] : null;
}

/**
 * The earliest wizard step that owns any of these errors, so submitting can
 * jump the user to the first thing that actually needs fixing.
 */
export function stepForFieldErrors(
  errors: FieldErrors,
  stepFields: Record<number, string[]>
): number | null {
  const steps = Object.entries(stepFields)
    .filter(([, fields]) =>
      fields.some(field =>
        Object.keys(errors).some(key => key === field || key.startsWith(`${field}.`))
      )
    )
    .map(([step]) => Number(step));

  return steps.length > 0 ? Math.min(...steps) : null;
}
