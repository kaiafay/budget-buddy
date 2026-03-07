import type {
  Account,
  RecurringException,
  RecurringRule,
  Transaction,
} from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

export async function fetchCalendarData(
  month: number,
  year: number,
): Promise<{
  account: Account | null;
  txBefore: { amount: number }[];
  transactions: Transaction[];
  recurringRules: RecurringRule[];
  exceptions: RecurringException[];
  firstDayOfMonth: string;
  lastDayOfMonth: string;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const month1Based = month;
  const firstDayOfMonth = `${year}-${String(month1Based).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month1Based, 0).getDate();
  const lastDayOfMonth = `${year}-${String(month1Based).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const [accountRes, txBeforeRes, txRes, rulesRes, exceptionsRes] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, name, starting_balance")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("transactions")
        .select("amount")
        .eq("user_id", user.id)
        .lt("date", firstDayOfMonth),
      supabase
        .from("transactions")
        .select("id, label, amount, date")
        .eq("user_id", user.id)
        .gte("date", firstDayOfMonth)
        .lte("date", lastDayOfMonth)
        .order("date", { ascending: true }),
      supabase
        .from("recurring_rules")
        .select("id, start_date, end_date, amount, label, frequency")
        .eq("user_id", user.id),
      supabase
        .from("recurring_exceptions")
        .select("id, rule_id, exception_date, type, modified_amount, modified_label")
        .eq("user_id", user.id),
    ]);

  if (accountRes.error) throw new Error(accountRes.error.message);
  if (txBeforeRes.error) throw new Error(txBeforeRes.error.message);
  if (txRes.error) throw new Error(txRes.error.message);
  if (rulesRes.error) throw new Error(rulesRes.error.message);
  if (exceptionsRes.error) throw new Error(exceptionsRes.error.message);

  return {
    account: accountRes.data as Account | null,
    txBefore: (txBeforeRes.data ?? []) as { amount: number }[],
    transactions: (txRes.data ?? []) as Transaction[],
    recurringRules: (rulesRes.data ?? []) as RecurringRule[],
    exceptions: (exceptionsRes.data ?? []) as RecurringException[],
    firstDayOfMonth,
    lastDayOfMonth,
  };
}

export async function fetchTransactions(): Promise<{
  transactions: Transaction[];
  recurringRules: RecurringRule[];
  exceptions: RecurringException[];
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const [txRes, rulesRes, exceptionsRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, label, amount, date")
      .eq("user_id", user.id)
      .order("date", { ascending: false }),
    supabase
      .from("recurring_rules")
      .select("id, start_date, end_date, amount, label, frequency")
      .eq("user_id", user.id),
    supabase
      .from("recurring_exceptions")
      .select("id, rule_id, exception_date, type, modified_amount, modified_label")
      .eq("user_id", user.id),
  ]);

  if (txRes.error) throw new Error(txRes.error.message);
  if (rulesRes.error) throw new Error(rulesRes.error.message);
  if (exceptionsRes.error) throw new Error(exceptionsRes.error.message);

  return {
    transactions: (txRes.data ?? []) as Transaction[],
    recurringRules: (rulesRes.data ?? []) as RecurringRule[],
    exceptions: (exceptionsRes.data ?? []) as RecurringException[],
  };
}
