import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  format,
  min,
  parseISO,
  subDays,
} from "date-fns";
import { createClient } from "@/lib/supabase/client";
import {
  applyRecurringEditFromDateArgsSchema,
  createAccountPayloadSchema,
  createCategoryPayloadSchema,
  createInvitationPayloadSchema,
  createRecurringRulePayloadSchema,
  createTransactionPayloadSchema,
  endRecurringRuleFutureArgsSchema,
  moveRecurringOccurrencePayloadSchema,
  recalibrateBalancePayloadSchema,
  safeParseMutation,
  skipRecurringOccurrenceArgsSchema,
  splitRecurringRuleAtDateArgsSchema,
  updateAccountPayloadSchema,
  updateCategoryPayloadSchema,
  updateRecurringSegmentInPlaceArgsSchema,
  updateTransactionPayloadSchema,
  upsertModifiedRecurringExceptionArgsSchema,
  uuidSchema,
} from "@/lib/validation";

// P0-1: user_id WHERE filters removed from all mutations below.
// RLS (Migration D) now enforces access control for shared accounts;
// keeping client-side user_id filters would silently block cross-member edits.

export async function deleteTransaction(
  id: string,
): Promise<{ error: Error | null }> {
  const idParsed = safeParseMutation(uuidSchema, id);
  if (!idParsed.ok) return { error: idParsed.error };
  const parsedId = idParsed.data;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", parsedId);
  return { error: error ?? null };
}

export async function skipRecurringOccurrence(
  ruleId: string,
  exceptionDate: string,
): Promise<{ error: Error | null }> {
  const argsParsed = safeParseMutation(skipRecurringOccurrenceArgsSchema, {
    ruleId,
    exceptionDate,
  });
  if (!argsParsed.ok) return { error: argsParsed.error };
  const { ruleId: parsedRuleId, exceptionDate: parsedExceptionDate } =
    argsParsed.data;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const { error } = await supabase.from("recurring_exceptions").upsert(
    {
      user_id: user.id,
      rule_id: parsedRuleId,
      exception_date: parsedExceptionDate,
      type: "skip",
    },
    { onConflict: "rule_id,exception_date" },
  );
  return { error: error ?? null };
}

export async function upsertModifiedRecurringException(
  ruleId: string,
  exceptionDate: string,
  payload: { label: string; amount: number; category_id?: string | null },
): Promise<{ error: Error | null }> {
  const argsParsed = safeParseMutation(upsertModifiedRecurringExceptionArgsSchema, {
    ruleId,
    exceptionDate,
    payload,
  });
  if (!argsParsed.ok) return { error: argsParsed.error };
  const {
    ruleId: parsedRuleId,
    exceptionDate: parsedExceptionDate,
    payload: parsedPayload,
  } = argsParsed.data;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const row: {
    user_id: string;
    rule_id: string;
    exception_date: string;
    type: string;
    modified_amount: number;
    modified_label: string;
    category_id: string | null;
  } = {
    user_id: user.id,
    rule_id: parsedRuleId,
    exception_date: parsedExceptionDate,
    type: "modified",
    modified_amount: parsedPayload.amount,
    modified_label: parsedPayload.label,
    category_id: parsedPayload.category_id ?? null,
  };
  const { error } = await supabase.from("recurring_exceptions").upsert(row, {
    onConflict: "rule_id,exception_date",
  });
  return { error: error ?? null };
}

export async function endRecurringRuleFuture(
  ruleId: string,
  lastOccurrenceDate: string,
): Promise<{ error: Error | null }> {
  const argsParsed = safeParseMutation(endRecurringRuleFutureArgsSchema, {
    ruleId,
    lastOccurrenceDate,
  });
  if (!argsParsed.ok) return { error: argsParsed.error };
  const { ruleId: parsedRuleId, lastOccurrenceDate: parsedLast } = argsParsed.data;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const lastDay = format(subDays(parseISO(parsedLast), 1), "yyyy-MM-dd");
  const { error } = await supabase
    .from("recurring_rules")
    .update({ end_date: lastDay })
    .eq("id", parsedRuleId);
  return { error: error ?? null };
}

export async function createTransaction(payload: {
  accountId: string;
  label: string;
  amount: number;
  date: string;
  category_id?: string | null;
}): Promise<{ data: { id: string } | null; error: Error | null }> {
  const parsed = safeParseMutation(createTransactionPayloadSchema, payload);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: new Error("Not authenticated") };
  const row: {
    user_id: string;
    account_id: string;
    label: string;
    amount: number;
    date: string;
    category_id?: string | null;
  } = {
    user_id: user.id,
    account_id: parsed.data.accountId,
    label: parsed.data.label,
    amount: parsed.data.amount,
    date: parsed.data.date,
  };
  if (parsed.data.category_id !== undefined) {
    row.category_id = parsed.data.category_id;
  }
  const { data, error } = await supabase
    .from("transactions")
    .insert(row)
    .select("id")
    .single();
  if (error) return { data: null, error: error ?? null };
  if (!data?.id) {
    return {
      data: null,
      error: new Error("Insert succeeded but no id returned"),
    };
  }
  return { data: { id: data.id as string }, error: null };
}

export async function moveRecurringOccurrence(payload: {
  ruleId: string;
  originalOccurrenceDate: string;
  targetDate: string;
  accountId: string;
  label: string;
  amount: number;
  category_id?: string | null;
}): Promise<{ error: Error | null }> {
  const parsed = safeParseMutation(moveRecurringOccurrencePayloadSchema, payload);
  if (!parsed.ok) return { error: parsed.error };
  const p = parsed.data;
  const orig = String(p.originalOccurrenceDate).slice(0, 10);
  const target = String(p.targetDate).slice(0, 10);
  if (orig === target) {
    return upsertModifiedRecurringException(p.ruleId, orig, {
      label: p.label,
      amount: p.amount,
      category_id: p.category_id,
    });
  }
  if (!p.accountId.trim()) {
    return { error: new Error("No account found — cannot move occurrence") };
  }
  const { data, error: insertError } = await createTransaction({
    accountId: p.accountId.trim(),
    label: p.label,
    amount: p.amount,
    date: target,
    category_id: p.category_id,
  });
  if (insertError) return { error: insertError };
  if (!data?.id) {
    return { error: new Error("Insert succeeded but no id returned") };
  }
  const { error: skipError } = await skipRecurringOccurrence(p.ruleId, orig);
  if (skipError) {
    await deleteTransaction(data.id);
    return { error: skipError };
  }
  return { error: null };
}

function computeEndDateFromCount(
  startDate: string,
  frequency: "weekly" | "biweekly" | "monthly" | "yearly",
  count: number,
): string {
  let d = parseISO(startDate);
  for (let i = 1; i < count; i++) {
    if (frequency === "weekly") d = addWeeks(d, 1);
    else if (frequency === "biweekly") d = addWeeks(d, 2);
    else if (frequency === "monthly") d = addMonths(d, 1);
    else d = addYears(d, 1);
  }
  return format(d, "yyyy-MM-dd");
}

export async function createRecurringRule(payload: {
  accountId: string;
  label: string;
  amount: number;
  frequency: "weekly" | "biweekly" | "monthly" | "yearly";
  startDate: string;
  category_id?: string | null;
  endDate?: string | null;
  recurrenceCount?: number | null;
}): Promise<{ error: Error | null }> {
  const parsed = safeParseMutation(createRecurringRulePayloadSchema, payload);
  if (!parsed.ok) return { error: parsed.error };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };

  let resolvedEndDate: string | null = null;
  if (parsed.data.endDate) {
    resolvedEndDate = parsed.data.endDate;
  } else if (parsed.data.recurrenceCount) {
    resolvedEndDate = computeEndDateFromCount(
      parsed.data.startDate,
      parsed.data.frequency,
      parsed.data.recurrenceCount,
    );
  }

  const row: {
    user_id: string;
    account_id: string;
    label: string;
    amount: number;
    frequency: string;
    start_date: string;
    end_date: string | null;
    root_rule_id: string | null;
    category_id?: string | null;
  } = {
    user_id: user.id,
    account_id: parsed.data.accountId,
    label: parsed.data.label,
    amount: parsed.data.amount,
    frequency: parsed.data.frequency,
    start_date: parsed.data.startDate,
    end_date: resolvedEndDate,
    root_rule_id: null,
  };
  if (parsed.data.category_id !== undefined) {
    row.category_id = parsed.data.category_id;
  }
  const { error } = await supabase.from("recurring_rules").insert(row);
  return { error: error ?? null };
}

export async function updateTransaction(
  id: string,
  payload: {
    label: string;
    amount: number;
    date: string;
    category_id?: string | null;
  },
): Promise<{ error: Error | null }> {
  const idParsed = safeParseMutation(uuidSchema, id);
  if (!idParsed.ok) return { error: idParsed.error };
  const payloadParsed = safeParseMutation(updateTransactionPayloadSchema, payload);
  if (!payloadParsed.ok) return { error: payloadParsed.error };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const update: {
    label: string;
    amount: number;
    date: string;
    category_id?: string | null;
  } = {
    label: payloadParsed.data.label,
    amount: payloadParsed.data.amount,
    date: payloadParsed.data.date,
  };
  if (payloadParsed.data.category_id !== undefined) {
    update.category_id = payloadParsed.data.category_id;
  }
  const { error } = await supabase
    .from("transactions")
    .update(update)
    .eq("id", idParsed.data);
  return { error: error ?? null };
}

type RuleForEdit = {
  id: string;
  start_date: string;
  root_rule_id: string | null;
  account_id: string;
  category_id: string | null;
};

const RULE_EDIT_SELECT =
  "id, start_date, root_rule_id, account_id, category_id";

function chainOrFilter(rootId: string): string {
  const safeId = uuidSchema.parse(rootId);
  return `id.eq.${safeId},root_rule_id.eq.${safeId}`;
}

function normalizeRuleDate(value: string): string {
  return String(value).slice(0, 10);
}

async function fetchRuleForEdit(
  supabase: ReturnType<typeof createClient>,
  ruleId: string,
): Promise<{ data: RuleForEdit | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("recurring_rules")
    .select(RULE_EDIT_SELECT)
    .eq("id", ruleId)
    .single();
  if (error) return { data: null, error: error ?? null };
  if (!data) return { data: null, error: null };
  return {
    data: {
      id: data.id,
      start_date: normalizeRuleDate(data.start_date),
      root_rule_id: data.root_rule_id ?? null,
      account_id: data.account_id,
      category_id: data.category_id ?? null,
    },
    error: null,
  };
}

function resolveRootId(rule: RuleForEdit): string {
  return rule.root_rule_id ?? rule.id;
}

async function getChainRuleIds(
  supabase: ReturnType<typeof createClient>,
  rootId: string,
): Promise<{ ids: string[]; error: Error | null }> {
  const { data, error } = await supabase
    .from("recurring_rules")
    .select("id")
    .or(chainOrFilter(rootId));
  if (error) return { ids: [], error: error ?? null };
  const ids = (data ?? []).map((r: { id: string }) => r.id);
  return { ids, error: null };
}

async function deleteModifiedExceptionsFromChain(
  supabase: ReturnType<typeof createClient>,
  chainRuleIds: string[],
  fromDate: string,
): Promise<{ error: Error | null }> {
  if (chainRuleIds.length === 0) return { error: null };
  const { error } = await supabase
    .from("recurring_exceptions")
    .delete()
    .eq("type", "modified")
    .gte("exception_date", fromDate)
    .in("rule_id", chainRuleIds);
  return { error: error ?? null };
}

export type RecurringSegmentPayload = {
  label: string;
  amount: number;
  frequency: "weekly" | "biweekly" | "monthly" | "yearly";
  category_id?: string | null;
  newStartDate?: string | null;
  endDate?: string | null;
  recurrenceCount?: number | null;
};

export async function updateRecurringSegmentInPlace(
  ruleId: string,
  payload: RecurringSegmentPayload,
): Promise<{ error: Error | null }> {
  const argsParsed = safeParseMutation(updateRecurringSegmentInPlaceArgsSchema, {
    ruleId,
    payload,
  });
  if (!argsParsed.ok) return { error: argsParsed.error };
  const { ruleId: parsedRuleId, payload: parsedPayload } = argsParsed.data;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const { data: rule, error: fetchError } = await fetchRuleForEdit(
    supabase,
    parsedRuleId,
  );
  if (fetchError) return { error: fetchError };
  if (!rule) return { error: new Error("Rule not found") };

  const rootId = resolveRootId(rule);
  const { ids: chainRuleIds, error: chainError } = await getChainRuleIds(
    supabase,
    rootId,
  );
  if (chainError) return { error: chainError };

  const categoryId =
    parsedPayload.category_id !== undefined
      ? parsedPayload.category_id
      : rule.category_id;

  const updateRow: {
    label: string;
    amount: number;
    frequency: string;
    category_id?: string | null;
    start_date?: string;
    end_date?: string | null;
  } = {
    label: parsedPayload.label,
    amount: parsedPayload.amount,
    frequency: parsedPayload.frequency,
  };
  if (categoryId !== undefined) updateRow.category_id = categoryId;

  const normalizedNewStart = parsedPayload.newStartDate
    ? normalizeRuleDate(parsedPayload.newStartDate)
    : null;
  if (normalizedNewStart && normalizedNewStart !== rule.start_date) {
    updateRow.start_date = normalizedNewStart;
  }

  if (parsedPayload.endDate !== undefined || parsedPayload.recurrenceCount !== undefined) {
    if (parsedPayload.recurrenceCount) {
      updateRow.end_date = computeEndDateFromCount(
        normalizedNewStart ?? rule.start_date,
        parsedPayload.frequency,
        parsedPayload.recurrenceCount,
      );
    } else {
      updateRow.end_date = parsedPayload.endDate ?? null;
    }
  }

  const { error: updateError } = await supabase
    .from("recurring_rules")
    .update(updateRow)
    .eq("id", parsedRuleId);
  if (updateError) return { error: updateError };

  const exceptionPivot =
    normalizedNewStart && normalizedNewStart !== rule.start_date
      ? format(
          min([parseISO(rule.start_date), parseISO(normalizedNewStart)]),
          "yyyy-MM-dd",
        )
      : rule.start_date;

  return deleteModifiedExceptionsFromChain(
    supabase,
    chainRuleIds,
    exceptionPivot,
  );
}

export async function splitRecurringRuleAtDate(
  ruleId: string,
  occurrenceDate: string,
  payload: RecurringSegmentPayload,
): Promise<{ error: Error | null }> {
  const argsParsed = safeParseMutation(splitRecurringRuleAtDateArgsSchema, {
    ruleId,
    occurrenceDate,
    payload,
  });
  if (!argsParsed.ok) return { error: argsParsed.error };
  const {
    ruleId: parsedRuleId,
    occurrenceDate: parsedOccurrenceDate,
    payload: parsedPayload,
  } = argsParsed.data;
  const occurrence = normalizeRuleDate(parsedOccurrenceDate);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };

  const { data: rule, error: fetchError } = await fetchRuleForEdit(
    supabase,
    parsedRuleId,
  );
  if (fetchError) return { error: fetchError };
  if (!rule) return { error: new Error("Rule not found") };

  if (occurrence <= rule.start_date) {
    return { error: new Error("Invalid occurrence date for split") };
  }

  const rootId = resolveRootId(rule);

  const { data: existingAtDate, error: existingError } = await supabase
    .from("recurring_rules")
    .select("id")
    .or(chainOrFilter(rootId))
    .eq("start_date", occurrence)
    .maybeSingle();
  if (existingError) return { error: existingError };
  if (existingAtDate?.id) {
    return updateRecurringSegmentInPlace(existingAtDate.id, parsedPayload);
  }

  const { ids: chainRuleIds, error: chainError } = await getChainRuleIds(
    supabase,
    rootId,
  );
  if (chainError) return { error: chainError };

  const lastDayOldRule = format(subDays(parseISO(occurrence), 1), "yyyy-MM-dd");
  const { error: endError } = await supabase
    .from("recurring_rules")
    .update({ end_date: lastDayOldRule })
    .eq("id", parsedRuleId);
  if (endError) return { error: endError };

  const { data: nextSegment, error: nextError } = await supabase
    .from("recurring_rules")
    .select("start_date")
    .or(chainOrFilter(rootId))
    .gt("start_date", occurrence)
    .order("start_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (nextError) return { error: nextError };

  const nextStart = nextSegment?.start_date
    ? normalizeRuleDate(String(nextSegment.start_date))
    : null;
  const newRuleEndDate = nextStart
    ? format(addDays(parseISO(nextStart), -1), "yyyy-MM-dd")
    : null;

  const newRuleCategoryId =
    parsedPayload.category_id !== undefined
      ? parsedPayload.category_id
      : rule.category_id;
  const newRootRuleId = rule.root_rule_id ?? parsedRuleId;

  const segmentStartDate = normalizeRuleDate(
    parsedPayload.newStartDate ?? occurrence,
  );

  let payloadEndDate: string | null = null;
  if (parsedPayload.recurrenceCount) {
    payloadEndDate = computeEndDateFromCount(
      segmentStartDate,
      parsedPayload.frequency,
      parsedPayload.recurrenceCount,
    );
  } else if (parsedPayload.endDate) {
    payloadEndDate = parsedPayload.endDate;
  }

  const resolvedNewRuleEndDate = nextStart ? newRuleEndDate : payloadEndDate;

  const { error: insertError } = await supabase.from("recurring_rules").insert({
    user_id: user.id,
    account_id: rule.account_id,
    label: parsedPayload.label,
    amount: parsedPayload.amount,
    frequency: parsedPayload.frequency,
    start_date: segmentStartDate,
    end_date: resolvedNewRuleEndDate,
    root_rule_id: newRootRuleId,
    category_id: newRuleCategoryId ?? null,
  });
  if (insertError) return { error: insertError };

  return deleteModifiedExceptionsFromChain(
    supabase,
    chainRuleIds,
    occurrence,
  );
}

export async function applyRecurringEditFromDate(
  ruleId: string,
  occurrenceDate: string,
  payload: RecurringSegmentPayload,
): Promise<{ error: Error | null }> {
  const argsParsed = safeParseMutation(applyRecurringEditFromDateArgsSchema, {
    ruleId,
    occurrenceDate,
    payload,
  });
  if (!argsParsed.ok) return { error: argsParsed.error };
  const {
    ruleId: parsedRuleId,
    occurrenceDate: parsedOccurrenceDate,
    payload: parsedPayload,
  } = argsParsed.data;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };

  const occurrence = normalizeRuleDate(parsedOccurrenceDate);
  const { data: rule, error: fetchError } = await fetchRuleForEdit(
    supabase,
    parsedRuleId,
  );
  if (fetchError) return { error: fetchError };
  if (!rule) return { error: new Error("Rule not found") };

  if (occurrence === rule.start_date) {
    return updateRecurringSegmentInPlace(parsedRuleId, parsedPayload);
  }
  if (occurrence > rule.start_date) {
    return splitRecurringRuleAtDate(parsedRuleId, occurrence, parsedPayload);
  }
  return { error: new Error("Occurrence is before this segment start date") };
}

export async function makeTransactionRecurring(
  transactionId: string,
  payload: {
    accountId: string;
    label: string;
    amount: number;
    startDate: string;
    category_id?: string | null;
    frequency: "weekly" | "biweekly" | "monthly" | "yearly";
    endDate?: string | null;
    recurrenceCount?: number | null;
  },
): Promise<{ error: Error | null }> {
  const idParsed = safeParseMutation(uuidSchema, transactionId);
  if (!idParsed.ok) return { error: idParsed.error };
  const parsedPayload = safeParseMutation(createRecurringRulePayloadSchema, payload);
  if (!parsedPayload.ok) return { error: parsedPayload.error };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };

  let resolvedEndDate: string | null = null;
  if (parsedPayload.data.endDate) {
    resolvedEndDate = parsedPayload.data.endDate;
  } else if (parsedPayload.data.recurrenceCount) {
    resolvedEndDate = computeEndDateFromCount(
      parsedPayload.data.startDate,
      parsedPayload.data.frequency,
      parsedPayload.data.recurrenceCount,
    );
  }

  const recurringRow: {
    user_id: string;
    account_id: string;
    label: string;
    amount: number;
    frequency: string;
    start_date: string;
    end_date: string | null;
    root_rule_id: string | null;
    category_id?: string | null;
  } = {
    user_id: user.id,
    account_id: parsedPayload.data.accountId,
    label: parsedPayload.data.label,
    amount: parsedPayload.data.amount,
    frequency: parsedPayload.data.frequency,
    start_date: parsedPayload.data.startDate,
    end_date: resolvedEndDate,
    root_rule_id: null,
  };
  if (parsedPayload.data.category_id !== undefined) {
    recurringRow.category_id = parsedPayload.data.category_id;
  }

  const { data: insertedRule, error: insertRuleError } = await supabase
    .from("recurring_rules")
    .insert(recurringRow)
    .select("id")
    .single();
  if (insertRuleError || !insertedRule?.id) {
    return { error: insertRuleError ?? new Error("Failed to create recurring rule") };
  }

  const { error: deleteError } = await deleteTransaction(idParsed.data);
  if (!deleteError) return { error: null };

  const { error: rollbackError } = await supabase
    .from("recurring_rules")
    .delete()
    .eq("id", insertedRule.id)
    .eq("user_id", user.id);
  if (rollbackError) {
    return {
      error: new Error(
        `Failed to delete original transaction and rollback recurring rule: ${deleteError.message}`,
      ),
    };
  }
  return { error: deleteError };
}

export async function recalibrateBalance(payload: {
  accountId: string;
  delta: number;
  date: string;
}): Promise<{ error: Error | null }> {
  const parsed = safeParseMutation(recalibrateBalancePayloadSchema, payload);
  if (!parsed.ok) return { error: parsed.error };
  if (parsed.data.delta === 0) return { error: null };
  const { error } = await createTransaction({
    accountId: parsed.data.accountId,
    label: "Balance adjustment",
    amount: parsed.data.delta,
    date: parsed.data.date,
  });
  return { error };
}

export async function createCategory(payload: {
  accountId: string;
  name: string;
  icon: string;
  type: "expense" | "income";
}): Promise<{ error: Error | null }> {
  const parsed = safeParseMutation(createCategoryPayloadSchema, payload);
  if (!parsed.ok) return { error: parsed.error };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const { error } = await supabase.from("categories").insert({
    user_id: user.id,
    account_id: parsed.data.accountId,
    name: parsed.data.name,
    icon: parsed.data.icon,
    type: parsed.data.type,
  });
  return { error: error ?? null };
}

export async function updateCategory(
  id: string,
  payload: {
    name?: string;
    icon?: string;
    type?: "expense" | "income";
  },
): Promise<{ error: Error | null }> {
  const idParsed = safeParseMutation(uuidSchema, id);
  if (!idParsed.ok) return { error: idParsed.error };
  const payloadParsed = safeParseMutation(updateCategoryPayloadSchema, payload);
  if (!payloadParsed.ok) return { error: payloadParsed.error };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const update: { name?: string; icon?: string; type?: string } = {};
  if (payloadParsed.data.name !== undefined) update.name = payloadParsed.data.name;
  if (payloadParsed.data.icon !== undefined) update.icon = payloadParsed.data.icon;
  if (payloadParsed.data.type !== undefined) update.type = payloadParsed.data.type;
  const { error } = await supabase
    .from("categories")
    .update(update)
    .eq("id", idParsed.data);
  return { error: error ?? null };
}

export async function createAccount(payload: {
  name: string;
  starting_balance: number;
}): Promise<{ data: { id: string } | null; error: Error | null }> {
  const parsed = safeParseMutation(createAccountPayloadSchema, payload);
  if (!parsed.ok) return { data: null, error: parsed.error };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: new Error("Not authenticated") };
  // P1-1: use an RPC so both inserts are atomic — avoids the chicken-and-egg
  // where the account_members INSERT fails after accounts INSERT succeeds,
  // leaving the account permanently inaccessible under RLS.
  const { data, error } = await supabase.rpc("create_account_with_member", {
    p_user_id: user.id,
    p_name: parsed.data.name,
    p_starting_balance: parsed.data.starting_balance,
  });
  if (error) return { data: null, error };
  if (!data) {
    return {
      data: null,
      error: new Error("Insert succeeded but no id returned"),
    };
  }
  return { data: { id: data as string }, error: null };
}

export async function updateAccount(
  id: string,
  payload: { name?: string; starting_balance?: number },
): Promise<{ error: Error | null }> {
  const idParsed = safeParseMutation(uuidSchema, id);
  if (!idParsed.ok) return { error: idParsed.error };
  const payloadParsed = safeParseMutation(updateAccountPayloadSchema, payload);
  if (!payloadParsed.ok) return { error: payloadParsed.error };
  if (
    payloadParsed.data.name === undefined &&
    payloadParsed.data.starting_balance === undefined
  ) {
    return { error: null };
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const update: { name?: string; starting_balance?: number } = {};
  if (payloadParsed.data.name !== undefined) update.name = payloadParsed.data.name;
  if (payloadParsed.data.starting_balance !== undefined) {
    update.starting_balance = payloadParsed.data.starting_balance;
  }
  const { error } = await supabase
    .from("accounts")
    .update(update)
    .eq("id", idParsed.data)
    .eq("user_id", user.id);
  return { error: error ?? null };
}

export async function deleteBudget(id: string): Promise<{ error: Error | null }> {
  const idParsed = safeParseMutation(uuidSchema, id);
  if (!idParsed.ok) return { error: idParsed.error };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  // P0-2: block deletion if non-owner members still exist.
  // ON DELETE CASCADE would silently remove them — the plan requires an explicit guard.
  const { data: memberRow } = await supabase
    .from("account_members")
    .select("id")
    .eq("account_id", idParsed.data)
    .neq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (memberRow) {
    return { error: new Error("Remove all members before deleting this budget.") };
  }
  const { error } = await supabase
    .from("accounts")
    .delete()
    .eq("id", idParsed.data)
    .eq("user_id", user.id);
  return { error: error ?? null };
}

export async function deleteCategory(id: string): Promise<{ error: Error | null }> {
  const idParsed = safeParseMutation(uuidSchema, id);
  if (!idParsed.ok) return { error: idParsed.error };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", idParsed.data);
  return { error: error ?? null };
}

export async function createInvitation(
  accountId: string,
  email: string,
): Promise<{ data: { token: string } | null; error: Error | null }> {
  const parsed = safeParseMutation(createInvitationPayloadSchema, { accountId, email });
  if (!parsed.ok) return { data: null, error: parsed.error };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: new Error("Not authenticated") };

  const normalizedEmail = parsed.data.email.toLowerCase();

  if (normalizedEmail === user.email?.toLowerCase()) {
    return { data: null, error: new Error("You can't invite yourself.") };
  }

  // Verify caller is the account owner
  const { data: account } = await supabase
    .from("accounts")
    .select("user_id")
    .eq("id", parsed.data.accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) {
    return { data: null, error: new Error("Only the budget owner can invite members.") };
  }

  // Check no unexpired pending invite already exists for this email
  const { data: existing } = await supabase
    .from("budget_invitations")
    .select("id")
    .eq("account_id", parsed.data.accountId)
    .eq("invited_email", normalizedEmail)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (existing) {
    return { data: null, error: new Error("An invite for this email is already pending.") };
  }

  const { data, error } = await supabase
    .from("budget_invitations")
    .insert({
      account_id: parsed.data.accountId,
      invited_by: user.id,
      invited_email: normalizedEmail,
    })
    .select("token")
    .single();
  if (error) {
    // P1-2: unique constraint on (account_id, invited_email) — treat as duplicate pending invite
    if (error.code === "23505") {
      return { data: null, error: new Error("An invite for this email is already pending.") };
    }
    return { data: null, error };
  }
  return { data: { token: data.token as string }, error: null };
}

export async function removeMember(
  accountId: string,
  userId: string,
): Promise<{ error: Error | null }> {
  const accountIdParsed = safeParseMutation(uuidSchema, accountId);
  if (!accountIdParsed.ok) return { error: accountIdParsed.error };
  const userIdParsed = safeParseMutation(uuidSchema, userId);
  if (!userIdParsed.ok) return { error: userIdParsed.error };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  if (userIdParsed.data === user.id) {
    return { error: new Error("Use leaveAccount to leave a budget.") };
  }
  // RLS enforces that only the account owner can delete another member's row.
  // The .neq("role", "owner") guard prevents accidentally removing the owner row.
  const { error } = await supabase
    .from("account_members")
    .delete()
    .eq("account_id", accountIdParsed.data)
    .eq("user_id", userIdParsed.data)
    .neq("role", "owner");
  return { error: error ?? null };
}

export async function revokeInvitation(
  id: string,
): Promise<{ error: Error | null }> {
  const idParsed = safeParseMutation(uuidSchema, id);
  if (!idParsed.ok) return { error: idParsed.error };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const { error } = await supabase
    .from("budget_invitations")
    .delete()
    .eq("id", idParsed.data)
    .eq("invited_by", user.id);
  return { error: error ?? null };
}

export async function leaveAccount(
  accountId: string,
): Promise<{ error: Error | null }> {
  const accountIdParsed = safeParseMutation(uuidSchema, accountId);
  if (!accountIdParsed.ok) return { error: accountIdParsed.error };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  // Owners cannot leave — they must delete the budget
  const { data: account } = await supabase
    .from("accounts")
    .select("user_id")
    .eq("id", accountIdParsed.data)
    .maybeSingle();
  if (account?.user_id === user.id) {
    return { error: new Error("Budget owners cannot leave. Delete the budget instead.") };
  }
  const { error } = await supabase
    .from("account_members")
    .delete()
    .eq("account_id", accountIdParsed.data)
    .eq("user_id", user.id);
  return { error: error ?? null };
}
