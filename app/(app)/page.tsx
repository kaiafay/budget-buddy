import { redirect } from "next/navigation";
import {
  addWeeks,
  addMonths,
  addYears,
  isBefore,
  isAfter,
} from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getProjectedBalances } from "@/lib/projection";
import { CalendarView } from "@/components/calendar-view";

type RecurringRuleRow = {
  id: string;
  start_date: string;
  end_date: string | null;
  amount: number;
  label: string;
  frequency: "weekly" | "biweekly" | "monthly" | "yearly";
};

function sumRecurringBeforeDate(
  rules: RecurringRuleRow[],
  firstDayOfMonth: string,
): number {
  const monthStart = new Date(firstDayOfMonth);
  let sum = 0;
  for (const rule of rules) {
    let cursor = new Date(rule.start_date);
    const end = rule.end_date ? new Date(rule.end_date) : addYears(new Date(), 10);
    while (isBefore(cursor, monthStart) && !isAfter(cursor, end)) {
      sum += rule.amount;
      if (rule.frequency === "weekly") cursor = addWeeks(cursor, 1);
      else if (rule.frequency === "biweekly") cursor = addWeeks(cursor, 2);
      else if (rule.frequency === "monthly") cursor = addMonths(cursor, 1);
      else if (rule.frequency === "yearly") cursor = addYears(cursor, 1);
      else break;
    }
  }
  return sum;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const now = new Date();
  const yearParam = params.year;
  const monthParam = params.month;
  const parsedYear = yearParam ? parseInt(yearParam, 10) : NaN;
  const parsedMonth = monthParam ? parseInt(monthParam, 10) : NaN;
  const year = Number.isFinite(parsedYear) ? parsedYear : now.getFullYear();
  const month1Based = Number.isFinite(parsedMonth)
    ? Math.min(12, Math.max(1, parsedMonth))
    : now.getMonth() + 1;
  const month0Based = month1Based - 1;

  const firstDayOfMonth = `${year}-${String(month1Based).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month1Based, 0).getDate();
  const lastDayOfMonth = `${year}-${String(month1Based).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const { data: account } = await supabase
    .from("accounts")
    .select("id, name, starting_balance")
    .eq("user_id", user.id)
    .maybeSingle();

  const accountStartingBalance = Number(account?.starting_balance ?? 0);
  const accountName = account?.name ?? "";
  const accountId = account?.id ?? null;
  let carryForwardBalance = accountStartingBalance;

  const transactionsForProj: {
    id: string;
    date: string;
    amount: number;
    label: string;
  }[] = [];
  const transactionsForSheet: {
    id: string;
    label: string;
    amount: number;
    type: "income" | "expense";
    date: string;
    category: string;
  }[] = [];
  let recurringRules: RecurringRuleRow[] = [];

  if (accountId) {
    const { data: rulesRows } = await supabase
      .from("recurring_rules")
      .select("id, start_date, end_date, amount, label, frequency")
      .eq("account_id", accountId);

    recurringRules = (rulesRows ?? []).map((r) => ({
      id: r.id,
      start_date: r.start_date,
      end_date: r.end_date ?? null,
      amount: Number(r.amount),
      label: r.label,
      frequency: r.frequency as "weekly" | "biweekly" | "monthly" | "yearly",
    }));

    const { data: txBeforeRows } = await supabase
      .from("transactions")
      .select("amount")
      .eq("account_id", accountId)
      .lt("date", firstDayOfMonth);

    const sumTxBefore =
      txBeforeRows?.reduce((s, row) => s + Number(row.amount), 0) ?? 0;
    const sumRecurringBefore = sumRecurringBeforeDate(
      recurringRules,
      firstDayOfMonth,
    );
    carryForwardBalance =
      accountStartingBalance + sumTxBefore + sumRecurringBefore;

    const { data: txRows } = await supabase
      .from("transactions")
      .select("id, label, amount, date")
      .eq("account_id", accountId)
      .gte("date", firstDayOfMonth)
      .lte("date", lastDayOfMonth)
      .order("date", { ascending: true });

    if (txRows) {
      for (const row of txRows) {
        const amount = Number(row.amount);
        transactionsForProj.push({
          id: row.id,
          date: row.date,
          amount,
          label: row.label,
        });
        transactionsForSheet.push({
          id: row.id,
          label: row.label,
          amount: Math.abs(amount),
          type: amount >= 0 ? "income" : "expense",
          date: row.date,
          category: (row as { category?: string }).category ?? "other",
        });
      }
    }
  } else {
    recurringRules = [];
  }

  const balances = getProjectedBalances(
    carryForwardBalance,
    transactionsForProj,
    recurringRules,
    month0Based,
    year,
  );

  return (
    <CalendarView
      balances={balances}
      transactions={transactionsForSheet}
      accountName={accountName}
      balanceYear={year}
      balanceMonth={month1Based}
    />
  );
}
