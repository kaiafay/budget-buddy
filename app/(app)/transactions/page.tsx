"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { DollarSign, ArrowDownLeft } from "lucide-react";
import useSWR from "swr";
import type { Transaction, GroupedTransactions } from "@/lib/types";
import { fetchTransactions } from "@/lib/api";
import { expandRecurringForDateRange } from "@/lib/projection";

function groupTransactionsByDate(
  transactions: Transaction[],
): GroupedTransactions[] {
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

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

export default function TransactionsPage() {
  const { data } = useSWR("transactions", fetchTransactions);

  const transactionsList: Transaction[] = useMemo(() => {
    if (!data) return [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const firstDayCurrent = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
    const lastDayCurrent = new Date(currentYear, currentMonth, 0).getDate();
    const lastDayOfCurrent = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(lastDayCurrent).padStart(2, "0")}`;
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const firstDayPrev = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;

    const txRows = (data.transactions ?? []).map((row) => ({
      id: row.id,
      label: row.label,
      amount: Number(row.amount),
      date: row.date,
    }));

    const rules = (data.recurringRules ?? []).map((r) => ({
      id: r.id,
      start_date: r.start_date,
      end_date: r.end_date ?? null,
      amount: Number(r.amount),
      label: r.label,
      frequency: r.frequency as "weekly" | "biweekly" | "monthly" | "yearly",
    }));

    const expanded = expandRecurringForDateRange(
      rules,
      firstDayPrev,
      lastDayOfCurrent,
      data.exceptions ?? [],
    );

    return [...txRows, ...expanded];
  }, [data]);

  const grouped = useMemo(
    () => groupTransactionsByDate(transactionsList),
    [transactionsList],
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="page-enter-1 px-5 pb-4 pt-6">
        <h1 className="text-xl font-semibold text-white">Transactions</h1>
        <p className="text-sm text-white/70">All your recent activity</p>
      </header>

      <div className="flex flex-col gap-6 px-5 pb-6">
        {grouped.map((group, index) => (
          <section
            key={group.date}
            className="transaction-group-enter"
            style={
              {
                "--enter-delay": `${0.1 + Math.min(index, 6) * 0.05}s`,
              } as React.CSSProperties
            }
          >
            <h2 className="pb-2 text-xs font-medium uppercase tracking-wide text-white/60">
              {group.formatted}
            </h2>
            <div className="glass-card flex flex-col gap-1 rounded-2xl p-2">
              {group.transactions.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                >
                  {t.amount > 0 ? (
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                      <DollarSign className="h-4 w-4 text-white" />
                    </div>
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                      <ArrowDownLeft className="h-4 w-4 text-white/70" />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col">
                    <span className="text-sm font-medium text-white">
                      {t.label}
                      {t.recurring && (
                        <span className="ml-1 text-xs text-white/70">↻</span>
                      )}
                    </span>
                  </div>
                  <span
                    className={
                      t.amount >= 0
                        ? "amount-text text-sm font-semibold tabular-nums text-[var(--amount-positive)]"
                        : "text-sm font-semibold tabular-nums text-[var(--amount-negative)]"
                    }
                  >
                    {t.amount >= 0 ? "+" : "-"}$
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
