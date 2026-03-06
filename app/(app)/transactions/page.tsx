import { redirect } from "next/navigation";
import {
  format,
  parseISO,
  addWeeks,
  addMonths,
  addYears,
  isAfter,
} from "date-fns";
import { DollarSign, ArrowDownLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type TransactionRow = {
  id: string;
  label: string;
  amount: number;
  date: string;
  recurring?: boolean;
};

type RecurringRuleRow = {
  id: string;
  start_date: string;
  end_date: string | null;
  amount: number;
  label: string;
  frequency: "weekly" | "biweekly" | "monthly" | "yearly";
};

type GroupedTransactions = {
  date: string;
  formatted: string;
  transactions: TransactionRow[];
};

function groupTransactionsByDate(transactions: TransactionRow[]): GroupedTransactions[] {
  const sorted = [...transactions].sort((a, b) =>
    b.date.localeCompare(a.date),
  );

  const groups: GroupedTransactions[] = [];
  let currentDate = "";
  let currentGroup: GroupedTransactions | null = null;

  for (const t of sorted) {
    if (t.date !== currentDate) {
      currentDate = t.date;
      currentGroup = {
        date: t.date,
        formatted: format(parseISO(t.date), "EEEE, MMM d"),
        transactions: [],
      };
      groups.push(currentGroup);
    }
    currentGroup!.transactions.push(t);
  }

  return groups;
}

export default async function TransactionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: txRows } = await supabase
    .from("transactions")
    .select("id, label, amount, date")
    .eq("user_id", user.id)
    .order("date", { ascending: false });

  const transactionsList: TransactionRow[] = (txRows ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    amount: Number(row.amount),
    date: row.date,
  }));

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (account?.id) {
    const { data: rulesRows } = await supabase
      .from("recurring_rules")
      .select("id, start_date, end_date, amount, label, frequency")
      .eq("account_id", account.id);

    const recurringRules: RecurringRuleRow[] = (rulesRows ?? []).map((r) => ({
      id: r.id,
      start_date: r.start_date,
      end_date: r.end_date ?? null,
      amount: Number(r.amount),
      label: r.label,
      frequency: r.frequency as "weekly" | "biweekly" | "monthly" | "yearly",
    }));

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const firstDayCurrent = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
    const lastDayCurrent = new Date(currentYear, currentMonth, 0).getDate();
    const lastDayOfCurrent = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(lastDayCurrent).padStart(2, "0")}`;
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const firstDayPrev = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;

    for (const rule of recurringRules) {
      let cursor = new Date(rule.start_date);
      const end = rule.end_date
        ? new Date(rule.end_date)
        : addYears(new Date(), 10);
      while (
        !isAfter(cursor, new Date(lastDayOfCurrent)) &&
        !isAfter(cursor, end)
      ) {
        const d = format(cursor, "yyyy-MM-dd");
        if (d >= firstDayPrev && d <= lastDayOfCurrent) {
          transactionsList.push({
            id: `${rule.id}-${d}`,
            label: rule.label,
            amount: rule.amount,
            date: d,
            recurring: true,
          });
        }
        if (rule.frequency === "weekly") cursor = addWeeks(cursor, 1);
        else if (rule.frequency === "biweekly") cursor = addWeeks(cursor, 2);
        else if (rule.frequency === "monthly") cursor = addMonths(cursor, 1);
        else if (rule.frequency === "yearly") cursor = addYears(cursor, 1);
        else break;
      }
    }
  }

  const grouped = groupTransactionsByDate(transactionsList);

  return (
    <div className="flex flex-col">
      <header className="px-5 pb-4 pt-6">
        <h1 className="text-xl font-semibold text-foreground">Transactions</h1>
        <p className="text-sm text-muted-foreground">
          All your recent activity
        </p>
      </header>

      <div className="flex flex-col gap-6 px-5 pb-6">
        {grouped.map((group) => (
          <section key={group.date}>
            <h2 className="pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.formatted}
            </h2>
            <div className="flex flex-col gap-1 rounded-2xl bg-card p-2 shadow-sm">
              {group.transactions.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                >
                  {t.amount > 0 ? (
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(79,107,237,0.1)]">
                      <DollarSign className="h-4 w-4 text-primary" />
                    </div>
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F1F5F9]">
                      <ArrowDownLeft className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col">
                    <span className="text-sm font-medium text-foreground">
                      {t.label}
                      {t.recurring && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ↻
                        </span>
                      )}
                    </span>
                  </div>
                  <span
                    className={
                      t.amount > 0
                        ? "text-sm font-semibold tabular-nums text-[#16A34A]"
                        : "text-sm font-semibold tabular-nums text-[#DC2626]"
                    }
                  >
                    {t.amount > 0 ? "+" : ""}$
                    {Math.abs(t.amount).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
