"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Transaction, RecurringRule } from "@/lib/types";
import { fetchCalendarData } from "@/lib/api";
import {
  getProjectedBalances,
  sumRecurringBeforeDate,
  expandRecurringForDateRange,
} from "@/lib/projection";
import { CalendarGrid } from "@/components/calendar-grid";

interface CalendarViewProps {
  initialMonth: number;
  initialYear: number;
}

export function CalendarView({ initialMonth, initialYear }: CalendarViewProps) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(initialYear);
  const [slideDirection, setSlideDirection] = useState<"prev" | "next" | null>(
    null,
  );
  const [initials, setInitials] = useState("··");

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        const email = data.user?.email ?? "";
        setInitials(email.slice(0, 2).toUpperCase());
      });
  }, []);

  const { data, isLoading } = useSWR(
    `calendar-month-${month}-${year}`,
    () => fetchCalendarData(month, year),
    { keepPreviousData: true },
  );

  const accountName = data?.account?.name ?? "";
  const recurringRulesMapped: RecurringRule[] = useMemo(
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
  }, [
    data,
    carryForwardBalance,
    transactionsForProj,
    recurringRulesMapped,
    month,
    year,
  ]);

  const transactions: Transaction[] = useMemo(() => {
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
    return [...monthTx, ...expanded].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
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

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayBalance = balances[todayStr] ?? carryForwardBalance;

  function onPrevMonth() {
    setSlideDirection("prev");
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function onNextMonth() {
    setSlideDirection("next");
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
          <span className="flex items-center gap-1 greeting-enter">
            <span className="wave-emoji">👋</span>{" "}
            <p className="text-base font-normal text-white/70">{greeting}</p>
          </span>
          <h1 className="account-enter min-h-7 text-xl font-semibold text-white">
            {accountName || "\u00A0"}
          </h1>
        </div>
        <div className="glass account-enter flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white">
          {initials}
        </div>
      </header>

      {/* Balance hero card */}
      <div className="balance-card-1 px-5 pb-2 pt-1">
        <div className="glass-card flex flex-col gap-0.5 rounded-2xl p-4">
          <span className="text-xs text-white/85">Current Balance</span>
          <span
            className={cn(
              "text-2xl font-bold tabular-nums",
              todayBalance >= 0
                ? "amount-text text-[var(--amount-positive)]"
                : "amount-text-negative text-[var(--amount-negative)]",
            )}
          >
            {todayBalance >= 0 ? "" : "-"}$
            {Math.abs(todayBalance).toLocaleString(undefined, {
              minimumFractionDigits: 2,
            })}
          </span>
        </div>
      </div>

      {/* Income / Expenses row */}
      <div className="flex gap-2 px-5 pb-3">
        <div className="balance-card-2 glass-card flex flex-1 flex-col gap-0.5 rounded-2xl p-3">
          <span className="text-[10px] text-white/85">Income</span>
          <span className="amount-text text-sm font-semibold tabular-nums text-[var(--amount-positive)]">
            +$
            {monthIncome.toLocaleString(undefined, {
              minimumFractionDigits: 2,
            })}
          </span>
        </div>
        <div className="balance-card-3 glass-card flex flex-1 flex-col gap-0.5 rounded-2xl p-3">
          <span className="text-[10px] text-white/85">Expenses</span>
          <span className="text-sm font-semibold tabular-nums text-[var(--amount-negative)]">
            -$
            {Math.abs(monthExpenses).toLocaleString(undefined, {
              minimumFractionDigits: 2,
            })}
          </span>
        </div>
      </div>

      {/* Calendar */}
      <div className="calendar-enter glass-card mt-1 mx-4 overflow-hidden rounded-3xl">
        <div
          key={`${year}-${month}`}
          className={cn(
            slideDirection === "next" && "calendar-slide-from-left",
            slideDirection === "prev" && "calendar-slide-from-right",
          )}
        >
          <CalendarGrid
            balances={balances}
            transactions={transactions}
            balanceYear={year}
            balanceMonth={month}
            onPrevMonth={onPrevMonth}
            onNextMonth={onNextMonth}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* FAB */}
      <Link
        href="/add"
        className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary shadow-lg transition-transform hover:scale-105 active:scale-95 sm:right-[calc(50%-14rem)]"
        aria-label="Add transaction"
      >
        <Plus className="h-5 w-5 text-white" />
      </Link>
    </div>
  );
}
