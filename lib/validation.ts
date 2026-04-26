import { z, ZodError } from "zod";

export const uuidSchema = z.string().uuid();

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const amountSchema = z.number().min(-1_000_000).max(1_000_000);

export const labelSchema = z.string().trim().min(1).max(200);

const categoryNameSchema = z.string().trim().min(1).max(100);

const categoryIconSchema = z.string().trim().min(1).max(50);

const frequencySchema = z.enum(["weekly", "biweekly", "monthly", "yearly"]);

const categoryIdOptionalSchema = z.union([uuidSchema, z.null()]).optional();

export const accountSchema = z.object({
  name: z.string().trim().min(1).max(100),
  starting_balance: amountSchema,
});

export const createTransactionPayloadSchema = z.object({
  accountId: uuidSchema,
  label: labelSchema,
  amount: amountSchema,
  date: isoDateSchema,
  category_id: categoryIdOptionalSchema,
});

export const updateTransactionPayloadSchema = z.object({
  label: labelSchema,
  amount: amountSchema,
  date: isoDateSchema,
  category_id: categoryIdOptionalSchema,
});

export const createRecurringRulePayloadSchema = z.object({
  accountId: uuidSchema,
  label: labelSchema,
  amount: amountSchema,
  frequency: frequencySchema,
  startDate: isoDateSchema,
  category_id: categoryIdOptionalSchema,
  endDate: z.union([isoDateSchema, z.null()]).optional(),
  recurrenceCount: z.number().int().min(1).max(9999).optional().nullable(),
}).refine(
  (data) => !(data.endDate && data.recurrenceCount),
  { message: "Cannot set both end date and recurrence count" },
);

export const moveRecurringOccurrencePayloadSchema = z.object({
  ruleId: uuidSchema,
  originalOccurrenceDate: isoDateSchema,
  targetDate: isoDateSchema,
  accountId: uuidSchema,
  label: labelSchema,
  amount: amountSchema,
  category_id: categoryIdOptionalSchema,
});

export const modifiedRecurringExceptionPayloadSchema = z.object({
  label: labelSchema,
  amount: amountSchema,
  category_id: categoryIdOptionalSchema,
});

export const recurringSegmentPayloadSchema = z.object({
  label: labelSchema,
  amount: amountSchema,
  frequency: frequencySchema,
  category_id: categoryIdOptionalSchema,
  newStartDate: z.union([isoDateSchema, z.null()]).optional(),
  endDate: z.union([isoDateSchema, z.null()]).optional(),
  recurrenceCount: z.number().int().min(1).max(9999).optional().nullable(),
}).refine(
  (data) => !(data.endDate && data.recurrenceCount),
  { message: "Cannot set both end date and recurrence count" },
);

export const createCategoryPayloadSchema = z.object({
  name: categoryNameSchema,
  icon: categoryIconSchema,
  type: z.enum(["expense", "income"]),
});

export const updateCategoryPayloadSchema = z.object({
  name: categoryNameSchema.optional(),
  icon: categoryIconSchema.optional(),
  type: z.enum(["expense", "income"]).optional(),
});

export const skipRecurringOccurrenceArgsSchema = z.object({
  ruleId: uuidSchema,
  exceptionDate: isoDateSchema,
});

export const endRecurringRuleFutureArgsSchema = z.object({
  ruleId: uuidSchema,
  lastOccurrenceDate: isoDateSchema,
});

export const upsertModifiedRecurringExceptionArgsSchema = z.object({
  ruleId: uuidSchema,
  exceptionDate: isoDateSchema,
  payload: modifiedRecurringExceptionPayloadSchema,
});

export const updateRecurringSegmentInPlaceArgsSchema = z.object({
  ruleId: uuidSchema,
  payload: recurringSegmentPayloadSchema,
});

export const splitRecurringRuleAtDateArgsSchema = z.object({
  ruleId: uuidSchema,
  occurrenceDate: isoDateSchema,
  payload: recurringSegmentPayloadSchema,
});

export const applyRecurringEditFromDateArgsSchema =
  splitRecurringRuleAtDateArgsSchema;

export function zodErrorToMessage(e: ZodError): string {
  const flat = e.flatten();
  const parts: string[] = [];
  for (const [key, msgs] of Object.entries(flat.fieldErrors)) {
    if (msgs?.length) parts.push(`${key}: ${msgs.join(", ")}`);
  }
  if (parts.length > 0) return parts.join("; ");
  if (flat.formErrors.length > 0) return flat.formErrors.join("; ");
  return "Validation failed";
}

export function safeParseMutation<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { ok: true; data: T } | { ok: false; error: Error } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return { ok: false, error: new Error(zodErrorToMessage(result.error)) };
}
