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
}): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const { error } = await supabase.from("transactions").insert({
    user_id: user.id,
    account_id: payload.accountId,
    label: payload.label,
    amount: payload.amount,
    date: payload.date,
  });
  return { error: error ?? null };
}

export async function createRecurringRule(payload: {
  accountId: string;
  label: string;
  amount: number;
  frequency: "weekly" | "biweekly" | "monthly" | "yearly";
  startDate: string;
}): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const { error } = await supabase.from("recurring_rules").insert({
    user_id: user.id,
    account_id: payload.accountId,
    label: payload.label,
    amount: payload.amount,
    frequency: payload.frequency,
    start_date: payload.startDate,
  });
  return { error: error ?? null };
}

export async function updateTransaction(
  id: string,
  payload: { label: string; amount: number; date: string },
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const { error } = await supabase
    .from("transactions")
    .update({
      label: payload.label,
      amount: payload.amount,
      date: payload.date,
    })
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
  },
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not authenticated") };
  const { data: rule, error: fetchError } = await supabase
    .from("recurring_rules")
    .select("account_id")
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
  const { error: insertError } = await supabase.from("recurring_rules").insert({
    user_id: user.id,
    account_id: rule.account_id,
    label: payload.label,
    amount: payload.amount,
    frequency: payload.frequency,
    start_date: occurrenceDate,
  });
  return { error: insertError ?? null };
}
