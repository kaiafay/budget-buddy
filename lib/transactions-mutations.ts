import { format, parseISO, subDays } from "date-fns";
import { createClient } from "@/lib/supabase/client";

export async function deleteTransaction(
  id: string,
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  return { error: error ?? null };
}

export async function skipRecurringOccurrence(
  ruleId: string,
  exceptionDate: string,
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const { error } = await supabase.from("recurring_exceptions").upsert(
    {
      user_id: user.id,
      rule_id: ruleId,
      exception_date: exceptionDate,
      type: "skip",
    },
    { onConflict: "rule_id,exception_date" },
  );
  return { error: error ?? null };
}

export async function endRecurringRuleFuture(
  ruleId: string,
  lastOccurrenceDate: string,
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const { error } = await supabase
    .from("recurring_rules")
    .update({ end_date: lastOccurrenceDate })
    .eq("id", ruleId)
    .eq("user_id", user.id);
  return { error: error ?? null };
}

export async function createTransaction(payload: {
  accountId: string;
  label: string;
  amount: number;
  date: string;
  category_id?: string | null;
}): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const row: {
    user_id: string;
    account_id: string;
    label: string;
    amount: number;
    date: string;
    category_id?: string | null;
  } = {
    user_id: user.id,
    account_id: payload.accountId,
    label: payload.label,
    amount: payload.amount,
    date: payload.date,
  };
  if (payload.category_id !== undefined) row.category_id = payload.category_id;
  const { error } = await supabase.from("transactions").insert(row);
  return { error: error ?? null };
}

export async function createRecurringRule(payload: {
  accountId: string;
  label: string;
  amount: number;
  frequency: "weekly" | "biweekly" | "monthly" | "yearly";
  startDate: string;
  category_id?: string | null;
}): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const row: {
    user_id: string;
    account_id: string;
    label: string;
    amount: number;
    frequency: string;
    start_date: string;
    category_id?: string | null;
  } = {
    user_id: user.id,
    account_id: payload.accountId,
    label: payload.label,
    amount: payload.amount,
    frequency: payload.frequency,
    start_date: payload.startDate,
  };
  if (payload.category_id !== undefined) row.category_id = payload.category_id;
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
    label: payload.label,
    amount: payload.amount,
    date: payload.date,
  };
  if (payload.category_id !== undefined) update.category_id = payload.category_id;
  const { error } = await supabase
    .from("transactions")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id);
  return { error: error ?? null };
}

export async function updateRecurringRule(
  ruleId: string,
  payload: {
    label: string;
    amount: number;
    frequency?: "weekly" | "biweekly" | "monthly" | "yearly";
  },
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const update: {
    label: string;
    amount: number;
    frequency?: "weekly" | "biweekly" | "monthly" | "yearly";
  } = { label: payload.label, amount: payload.amount };
  if (payload.frequency !== undefined) update.frequency = payload.frequency;
  const { error } = await supabase
    .from("recurring_rules")
    .update(update)
    .eq("id", ruleId)
    .eq("user_id", user.id);
  return { error: error ?? null };
}

export async function updateRecurringRuleFromDate(
  ruleId: string,
  occurrenceDate: string,
  payload: {
    label: string;
    amount: number;
    frequency: "weekly" | "biweekly" | "monthly" | "yearly";
    category_id?: string | null;
  },
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const { data: rule, error: fetchError } = await supabase
    .from("recurring_rules")
    .select("account_id, category_id")
    .eq("id", ruleId)
    .eq("user_id", user.id)
    .single();
  if (fetchError) return { error: fetchError ?? null };
  if (!rule) return { error: new Error("Rule not found") };
  const lastDayOldRule = format(
    subDays(parseISO(occurrenceDate), 1),
    "yyyy-MM-dd",
  );
  const { error: updateError } = await supabase
    .from("recurring_rules")
    .update({ end_date: lastDayOldRule })
    .eq("id", ruleId)
    .eq("user_id", user.id);
  if (updateError) return { error: updateError ?? null };
  const newRuleCategoryId =
    payload.category_id !== undefined
      ? payload.category_id
      : rule.category_id ?? null;
  const { error: insertError } = await supabase.from("recurring_rules").insert({
    user_id: user.id,
    account_id: rule.account_id,
    label: payload.label,
    amount: payload.amount,
    frequency: payload.frequency,
    start_date: occurrenceDate,
    category_id: newRuleCategoryId,
  });
  return { error: insertError ?? null };
}

export async function createCategory(payload: {
  name: string;
  icon: string;
  type: "expense" | "income";
}): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const { error } = await supabase.from("categories").insert({
    user_id: user.id,
    name: payload.name,
    icon: payload.icon,
    type: payload.type,
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
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const update: { name?: string; icon?: string; type?: string } = {};
  if (payload.name !== undefined) update.name = payload.name;
  if (payload.icon !== undefined) update.icon = payload.icon;
  if (payload.type !== undefined) update.type = payload.type;
  const { error } = await supabase
    .from("categories")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id);
  return { error: error ?? null };
}

export async function deleteCategory(id: string): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  return { error: error ?? null };
}
