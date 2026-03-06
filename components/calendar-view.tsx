"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Plus } from "lucide-react";
import { fetchCalendarData } from "@/lib/api";
import {
  getProjectedBalances,
  sumRecurringBeforeDate,
  expandRecurringForDateRange,
  type RecurringRuleRow,
} from "@/lib/projection";
import { CalendarGrid } from "@/components/calendar-grid";

export type CalendarViewTransaction = {
  id: string;
  label: string;
  amount: number;
  date: string;
  recurring?: boolean;
};

export type RecurringRule = {
  id: string;
  label: string;
  amount: number;
  frequency: "weekly" | "biweekly" | "monthly" | "yearly";
  start_date: string;
  end_date?: string | null;
};

interface CalendarViewProps {
  initialMonth: number;
  initialYear: number;
}

export function CalendarView({ initialMonth, initialYear }: CalendarViewProps) {
  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(initialYear);

  const { data, isLoading } = useSWR(
    `calendar-month-${month}-${year}`,
    () => fetchCalendarData(month, year),
  );

  const accountName = data?.account?.name ?? "";
  const recurringRulesMapped: RecurringRuleRow[] = useMemo(
    () =>
      (data?.recurringRules ?? []).map((r) => ({
        id: r.id,
        start_date: r.start_date,
        end_date: r.end_date ?? null,
        amount: Number(r.amount),
        label: r.label,
        frequency: r.frequency as "weekly" | "biweekly" | "monthly" | "yearly",
      })),
    [data?.recurringRules],
  );

  const carryForwardBalance = useMemo(() => {
    if (!data) return 0;
    const accountStarting = Number(data.account?.starting_balance ?? 0);
    const sumTxBefore =
      (data.txBefore ?? []).reduce((s, row) => s + Number(row.amount), 0) ?? 0;
    const sumRecurringBefore = sumRecurringBeforeDate(
      recurringRulesMapped,
      data.firstDayOfMonth,
    );
    return accountStarting + sumTxBefore + sumRecurringBefore;
  }, [data, recurringRulesMapped]);

  const transactionsForProj = useMemo(
    () =>
      (data?.transactions ?? []).map((t) => ({
        id: t.id,
        date: t.date,
        amount: Number(t.amount),
        label: t.label,
      })),
    [data?.transactions],
  );

  const balances = useMemo(() => {
    if (!data) return {};
    return getProjectedBalances(
      carryForwardBalance,
      transactionsForProj,
      recurringRulesMapped,
      month - 1,
      year,
    );
  }, [data, carryForwardBalance, transactionsForProj, recurringRulesMapped, month, year]);

  const transactions: CalendarViewTransaction[] = useMemo(() => {
    if (!data) return [];
    const monthTx = (data.transactions ?? []).map((t) => ({
      id: t.id,
      label: t.label,
      amount: Number(t.amount),
      date: t.date,
    }));
    const expanded = expandRecurringForDateRange(
      recurringRulesMapped,
      data.firstDayOfMonth,
      data.lastDayOfMonth,
    );
    return [...monthTx, ...expanded].sort((a, b) => a.date.localeCompare(b.date));
  }, [data, recurringRulesMapped]);

  const monthIncome = useMemo(
    () =>
      transactions
        .filter((t) => t.amount > 0)
        .reduce((s, t) => s + t.amount, 0),
    [transactions],
  );
  const monthExpenses = useMemo(
    () =>
      transactions
        .filter((t) => t.amount < 0)
        .reduce((s, t) => s + t.amount, 0),
    [transactions],
  );

  function onPrevMonth() {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function onNextMonth() {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  return (
    <div className="flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 pb-2 pt-4">
        <div>
          <p className="text-base font-normal text-muted-foreground">
            👋 Good morning
          </p>
          <h1 className="text-xl font-semibold text-foreground">
            {accountName}
          </h1>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          JD
        </div>
      </header>

      {/* Summary cards */}
      <div className="flex gap-3 px-5 pb-2 pt-1">
        <div className="flex flex-1 flex-col gap-0.5 rounded-2xl bg-card p-3 shadow-sm">
          <span className="text-xs text-muted-foreground">Income</span>
          <span className="text-lg font-semibold tabular-nums text-[#22C55E]">
            +$
            {monthIncome.toLocaleString(undefined, {
              minimumFractionDigits: 2,
            })}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-0.5 rounded-2xl bg-card p-3 shadow-sm">
          <span className="text-xs text-muted-foreground">Expenses</span>
          <span className="text-lg font-semibold tabular-nums text-[#EF4444]">
            -$
            {Math.abs(monthExpenses).toLocaleString(undefined, {
              minimumFractionDigits: 2,
            })}
          </span>
        </div>
      </div>

      {/* Calendar */}
      <div className="mt-1 rounded-t-3xl bg-card pt-1 shadow-sm">
        <CalendarGrid
          balances={balances}
          transactions={transactions}
          recurringRules={recurringRulesMapped as RecurringRule[]}
          balanceYear={year}
          balanceMonth={month}
          onPrevMonth={onPrevMonth}
          onNextMonth={onNextMonth}
          isLoading={isLoading}
        />
      </div>

      {/* FAB */}
      <Link
        href="/add"
        className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary shadow-lg transition-transform hover:scale-105 active:scale-95 sm:right-[calc(50%-14rem)]"
        aria-label="Add transaction"
      >
        <Plus className="h-5 w-5 text-primary-foreground" />
      </Link>
    </div>
  );
}
