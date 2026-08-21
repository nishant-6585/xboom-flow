/**
 * Validation + payload sanitisation for the Procurement → Imports form.
 *
 * Mandatory fields (decided from the DB shape and business need):
 *   - at least one product with a name, quantity >= 1 and unit price > 0
 *   - supplier (uuid)
 *   - currency
 *   - order date
 *   - status, payment status
 *   - payment amount + payment date when payment status is partial/paid
 *
 * Every other field is optional and MUST be sent as null (never "") because
 * Postgres rejects empty strings for date/uuid/numeric columns.
 */

export type ImportFieldErrors = Record<string, string>;

/** Columns Postgres rejects when given '' (date / uuid / numeric). */
export const EMPTY_TO_NULL_FIELDS = [
  "supplier_id",
  "order_date",
  "expected_arrival",
  "actual_arrival",
  "clearance_date",
  "payment_date",
  "supplier_name",
  "product_category",
  "origin_country",
  "port_of_origin",
  "port_of_destination",
  "shipping_method",
  "shipping_line",
  "container_number",
  "bl_number",
  "po_document_url",
  "payment_proof_url",
  "courier_document_url",
  "bill_of_entry_url",
  "packing_list_url",
  "commercial_invoice_url",
  "notes",
  "unit_price",
  "payment_amount",
] as const;

/** Fields that are required, mapped to the wizard step that contains them. */
export const IMPORT_FIELD_STEP: Record<string, number> = {
  items: 1,
  currency: 1,
  supplier_id: 2,
  order_date: 2,
  status: 3,
  payment_status: 5,
  payment_amount: 5,
  payment_date: 5,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function isValidDate(value: unknown): boolean {
  if (typeof value !== "string" || !DATE_RE.test(value.trim())) return false;
  const d = new Date(`${value.trim()}T00:00:00Z`);
  return !Number.isNaN(d.getTime());
}

export function sanitizeImportPayload<T extends Record<string, any>>(payload: T): T {
  const cleaned: Record<string, any> = { ...payload };
  for (const field of EMPTY_TO_NULL_FIELDS) {
    const v = cleaned[field];
    if (v === "" || v === undefined || (typeof v === "string" && v.trim() === "")) {
      cleaned[field] = null;
    } else if (typeof v === "number" && Number.isNaN(v)) {
      cleaned[field] = null;
    }
  }
  // Any other stray empty string on a *_date / *_id key is also nulled.
  for (const key of Object.keys(cleaned)) {
    if (
      typeof cleaned[key] === "string" &&
      cleaned[key].trim() === "" &&
      (key.endsWith("_date") || key.endsWith("_id") || key.endsWith("_arrival"))
    ) {
      cleaned[key] = null;
    }
  }
  return cleaned as T;
}

export interface ImportValidationInput {
  supplier_id?: string | null;
  currency?: string | null;
  order_date?: string | null;
  expected_arrival?: string | null;
  actual_arrival?: string | null;
  clearance_date?: string | null;
  status?: string | null;
  payment_status?: string | null;
  payment_amount?: number | null;
  payment_date?: string | null;
  items?: Array<{
    product_name?: string;
    quantity?: number;
    unit_price?: number;
  }>;
}

export function validateImportForm(input: ImportValidationInput): ImportFieldErrors {
  const errors: ImportFieldErrors = {};

  const items = input.items ?? [];
  const filled = items.filter((i) => (i.product_name ?? "").trim() !== "");
  if (filled.length === 0) {
    errors.items = "Add at least one product with a name";
  } else {
    items.forEach((item, idx) => {
      if ((item.product_name ?? "").trim() === "") {
        errors[`items.${idx}.product_name`] = "Product name is required";
      }
      if (!item.quantity || item.quantity < 1) {
        errors[`items.${idx}.quantity`] = "Quantity must be at least 1";
      }
      if (item.unit_price === undefined || item.unit_price === null || item.unit_price <= 0) {
        errors[`items.${idx}.unit_price`] = "Unit price must be greater than 0";
      }
    });
  }

  if (!(input.currency ?? "").trim()) errors.currency = "Currency is required";

  if (!(input.supplier_id ?? "").trim()) {
    errors.supplier_id = "Supplier is required";
  } else if (!isValidUuid(input.supplier_id)) {
    errors.supplier_id = "Select a supplier from the list";
  }

  if (!(input.order_date ?? "").trim()) {
    errors.order_date = "Order date is required";
  } else if (!isValidDate(input.order_date)) {
    errors.order_date = "Enter a valid date (YYYY-MM-DD)";
  }

  // Optional dates: only validated when filled in.
  for (const key of ["expected_arrival", "actual_arrival", "clearance_date", "payment_date"] as const) {
    const v = (input as any)[key];
    if (typeof v === "string" && v.trim() !== "" && !isValidDate(v)) {
      errors[key] = "Enter a valid date (YYYY-MM-DD)";
    }
  }

  if (!(input.status ?? "").trim()) errors.status = "Status is required";
  if (!(input.payment_status ?? "").trim()) errors.payment_status = "Payment status is required";

  if (input.payment_status === "partial" || input.payment_status === "paid") {
    if (!input.payment_amount || input.payment_amount <= 0) {
      errors.payment_amount = "Enter the amount paid";
    }
    if (!(input.payment_date ?? "").trim()) {
      errors.payment_date = "Payment date is required when a payment was made";
    }
  }

  return errors;
}

export function firstErrorStep(errors: ImportFieldErrors): number | null {
  const keys = Object.keys(errors);
  if (keys.length === 0) return null;
  const steps = keys.map((k) => {
    if (k.startsWith("items")) return 1;
    return IMPORT_FIELD_STEP[k] ?? 1;
  });
  return Math.min(...steps);
}

/**
 * Translate a Postgres/PostgREST error into a friendly message plus, where
 * possible, the specific field that caused it.
 */
export function mapImportServerError(error: any): { message: string; fieldErrors: ImportFieldErrors } {
  const raw: string = error?.message ?? "";
  const details: string = error?.details ?? "";
  const text = `${raw} ${details}`;
  const fieldErrors: ImportFieldErrors = {};

  const columnMatch =
    /column "([a-z0-9_]+)"/i.exec(text) ||
    /"([a-z0-9_]+)" violates/i.exec(text) ||
    /Key \(([a-z0-9_]+)\)/i.exec(text);
  const column = columnMatch?.[1];

  const code = error?.code;

  if (code === "22007" || code === "22008" || /invalid input syntax for type (date|timestamp)/i.test(text)) {
    const field = column ?? "order_date";
    fieldErrors[field] = "Enter a valid date";
    return { message: `Invalid date in "${field.replace(/_/g, " ")}".`, fieldErrors };
  }

  if (code === "22P02" || /invalid input syntax for type uuid/i.test(text)) {
    const field = column ?? "supplier_id";
    fieldErrors[field] = "Select a valid option";
    return { message: `Invalid value in "${field.replace(/_/g, " ")}".`, fieldErrors };
  }

  if (code === "23502" || /null value in column/i.test(text)) {
    const field = column ?? "";
    if (field) fieldErrors[field] = "This field is required";
    return {
      message: field
        ? `"${field.replace(/_/g, " ")}" is required.`
        : "A required field is missing.",
      fieldErrors,
    };
  }

  if (code === "23505" || /duplicate key/i.test(text)) {
    return { message: "An import with these details already exists.", fieldErrors };
  }

  if (code === "23514" || /violates check constraint/i.test(text)) {
    if (column) fieldErrors[column] = "Value is not allowed";
    return { message: "One of the values is not allowed. Please review the form.", fieldErrors };
  }

  if (code === "42501" || /row-level security|permission denied/i.test(text)) {
    return {
      message: "You do not have permission to save imports. Ask an admin for access.",
      fieldErrors,
    };
  }

  return { message: raw || "Something went wrong while saving the import.", fieldErrors };
}
