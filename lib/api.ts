import { createClient } from "@/lib/supabase/client";
import {
  addWeeks,
  addMonths,
  addYears,
  isAfter,
  isBefore,
  format,
} from "date-fns";

export async function fetchCalendarData(month: number, year: number) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const month1Based = month;
  const firstDayOfMonth = `${year}-${String(month1Based).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month1Based, 0).getDate();
  const lastDayOfMonth = `${year}-${String(month1Based).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const [accountRes, txBeforeRes, txRes, rulesRes] = await Promise.all([
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
  ]);

  return {
    account: accountRes.data,
    txBefore: txBeforeRes.data ?? [],
    transactions: txRes.data ?? [],
    recurringRules: rulesRes.data ?? [],
    firstDayOfMonth,
    lastDayOfMonth,
  };
}

export async function fetchTransactions() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const [txRes, rulesRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, label, amount, date")
      .eq("user_id", user.id)
      .order("date", { ascending: false }),
    supabase
      .from("recurring_rules")
      .select("id, start_date, end_date, amount, label, frequency")
      .eq("user_id", user.id),
  ]);

  return {
    transactions: txRes.data ?? [],
    recurringRules: rulesRes.data ?? [],
  };
}
