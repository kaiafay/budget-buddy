"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Transaction, RecurringRule } from "@/lib/types";
import { fetchCalendarData } from "@/lib/api";
import { mapRecurringRuleRow } from "@/lib/recurring-rules";
import { invalidateNext12CalendarMonths } from "@/lib/swr-invalidate";
import { calendarMonthSwrKey, transactionsSwrKey } from "@/lib/swr-keys";
import {
  getProjectedBalances,
  sumRecurringBeforeDate,
  expandRecurringForDateRange,
  getTransactionsForDate,
} from "@/lib/projection";
import { AmountText } from "@/components/amount-text";
import { ErrorBanner } from "@/components/error-banner";
import { CalendarGrid } from "@/components/calendar-grid";
import { DayTransactionsContent } from "@/components/day-sheet";
import { AccountPicker } from "@/components/account-picker";
import { useActiveAccount } from "@/components/active-account-provider";
import { withActiveAccountQuery } from "@/lib/url";

interface CalendarViewProps {
  initialMonth: number;
  initialYear: number;
  initialSelectedDate?: string;
  givenName?: string;
  avatarInitials?: string;
}

export function CalendarView({
  initialMonth,
  initialYear,
  initialSelectedDate,
  givenName = "",
  avatarInitials = "··",
}: CalendarViewProps) {
  const router = useRouter();
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const {
    accounts,
    activeAccountId,
    setActiveAccount,
    isLoading: accountsLoading,
    hasNoAccounts,
  } = useActiveAccount();
  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(initialYear);
  const [slideDirection, setSlideDirection] = useState<"prev" | "next" | null>(
    null,
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(
    () => initialSelectedDate ?? null,
  );
  useEffect(() => {
    if (!initialSelectedDate || initialSelectedDate.length < 10) return;
    setSelectedDate(initialSelectedDate);
    const y = Number(initialSelectedDate.slice(0, 4));
    const m = Number(initialSelectedDate.slice(5, 7));
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return;
    setYear(y);
    setMonth(m);
  }, [initialSelectedDate]);

  const { mutate } = useSWRConfig();
  const calendarKey = activeAccountId
    ? calendarMonthSwrKey(month, year, activeAccountId)
    : null;
  const {
    data,
    isLoading,
    error: calendarError,
    mutate: revalidateCalendarMonth,
  } = useSWR(
    calendarKey,
    () => fetchCalendarData(month, year, activeAccountId as string),
    { keepPreviousData: true },
  );

  const recurringRulesMapped: RecurringRule[] = useMemo(
    () => (data?.recurringRules ?? []).map(mapRecurringRuleRow),
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
      data.exceptions ?? [],
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
      data.exceptions ?? [],
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
      category_id: t.category_id ?? null,
    }));
    const expanded = expandRecurringForDateRange(
      recurringRulesMapped,
      data.firstDayOfMonth,
      data.lastDayOfMonth,
      data.exceptions ?? [],
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

  const firstDayOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;
  const currentMonthKey = `${year}-${String(month).padStart(2, "0")}`;
  const effectiveDate =
    selectedDate ??
    (todayStr.slice(0, 7) === currentMonthKey ? todayStr : firstDayOfMonth);

  const effMonth = effectiveDate ? parseInt(effectiveDate.slice(5, 7), 10) : 0;
  const effYear = effectiveDate ? parseInt(effectiveDate.slice(0, 4), 10) : 0;
  const needDaySheetMonth =
    effectiveDate && (effMonth !== month || effYear !== year);

  const daySheetKey =
    needDaySheetMonth && activeAccountId
      ? calendarMonthSwrKey(effMonth, effYear, activeAccountId)
      : null;
  const {
    data: daySheetMonthData,
    isLoading: daySheetMonthLoading,
    error: daySheetMonthError,
    mutate: revalidateDaySheetMonth,
  } = useSWR(
    daySheetKey,
    () => fetchCalendarData(effMonth, effYear, activeAccountId as string),
    { keepPreviousData: true },
  );

  const daySheetMonthSource = needDaySheetMonth ? daySheetMonthData : data;
  const daySheetRecurringMapped: RecurringRule[] = useMemo(
    () => (daySheetMonthSource?.recurringRules ?? []).map(mapRecurringRuleRow),
    [daySheetMonthSource?.recurringRules],
  );
  const daySheetTransactions: Transaction[] = useMemo(() => {
    if (!daySheetMonthSource) return [];
    const [y, m] = effectiveDate.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const first = `${y}-${String(m).padStart(2, "0")}-01`;
    const last = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return getTransactionsForDate(
      (daySheetMonthSource.transactions ?? []).map((t) => ({
        id: t.id,
        label: t.label,
        amount: Number(t.amount),
        date: t.date,
        category_id: t.category_id ?? null,
      })),
      daySheetRecurringMapped,
      first,
      last,
      effectiveDate,
      daySheetMonthSource.exceptions ?? [],
    );
  }, [daySheetMonthSource, daySheetRecurringMapped, effectiveDate]);

  const daySheetLoading =
    needDaySheetMonth && daySheetMonthLoading && !daySheetMonthError;

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

  function handleDaySelect(date: string) {
    setSelectedDate(date);
    router.replace(
      withActiveAccountQuery(
        `/?month=${month}&year=${year}&selected=${date}`,
        activeAccountId,
      ),
      { scroll: false },
    );
  }

  if (!accountsLoading && hasNoAccounts) {
    return (
      <div className="flex flex-col px-5 pb-6 pt-12 text-white">
        <div className="glass-card flex flex-col items-center gap-4 rounded-2xl px-6 py-10 text-center">
          <h2 className="text-base font-semibold text-white">
            Create your first budget
          </h2>
          <p className="text-sm text-white/70">
            You don&apos;t have a budget yet. Set one up in Settings to start
            tracking transactions.
          </p>
          <Link
            href="/settings"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/80"
          >
            Go to Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col pb-6">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 pb-2 pt-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1 greeting-enter">
            <span className="wave-emoji shrink-0" aria-hidden>
              👋
            </span>
            <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-base font-normal leading-none text-white/70">
              <span>{givenName ? `${greeting},` : greeting}</span>
              {givenName ? (
                <span className="relative top-[0.3px]">{givenName}</span>
              ) : null}
            </span>
          </div>
          <AccountPicker
            accounts={accounts}
            activeAccountId={activeAccountId}
            onSelect={setActiveAccount}
          />
        </div>
        <div className="glass account-enter flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white">
          {avatarInitials}
        </div>
      </header>

      {calendarError && (
        <ErrorBanner
          variant="panel"
          className="page-enter-1 mx-4 mb-3"
          message="Couldn't load this month. Check your connection and try again."
          onRetry={() => void revalidateCalendarMonth()}
        />
      )}

      {/* Balance hero card */}
      <div className="balance-card-1 px-5 pb-2 pt-1">
        <div className="glass-card flex flex-col gap-0.5 rounded-2xl p-4">
          <span className="text-xs text-white/85">Current Balance</span>
          <AmountText
            amount={todayBalance}
            variant="hero"
            signDisplay="negativeOnly"
          />
        </div>
      </div>

      {/* Income / Expenses row */}
      <div className="flex gap-2 px-5 pb-3">
        <div className="balance-card-2 glass-card flex flex-1 flex-col gap-0.5 rounded-2xl p-3">
          <span className="text-[10px] text-white/85">Income</span>
          <AmountText
            amount={monthIncome}
            polarity="positive"
            signDisplay="always"
          />
        </div>
        <div className="balance-card-3 glass-card flex flex-1 flex-col gap-0.5 rounded-2xl p-3">
          <span className="text-[10px] text-white/85">Expenses</span>
          <AmountText
            amount={monthExpenses}
            polarity="negative"
            signDisplay="always"
          />
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
            balanceYear={year}
            balanceMonth={month}
            onPrevMonth={onPrevMonth}
            onNextMonth={onNextMonth}
            isLoading={isLoading && !calendarError}
            selectedDate={selectedDate}
            onSelectedDateChange={handleDaySelect}
          />
        </div>
        {needDaySheetMonth && daySheetMonthError ? (
          <ErrorBanner
            variant="strip"
            message="Couldn't load transactions for this day."
            onRetry={() => void revalidateDaySheetMonth()}
          />
        ) : daySheetLoading ? (
          <div className="border-t border-white/20 px-5 pb-6 pt-4">
            <p className="text-overlay text-xs text-white/70">Loading…</p>
          </div>
        ) : (
          <DayTransactionsContent
            date={effectiveDate}
            transactions={daySheetTransactions}
            recurringRules={daySheetRecurringMapped}
            accountId={activeAccountId}
            onMutate={(opts) => {
              const td = opts?.targetDate;
              if (td && td.length >= 10) {
                setSelectedDate(td);
                const ty = Number(td.slice(0, 4));
                const tm = Number(td.slice(5, 7));
                if (
                  Number.isFinite(ty) &&
                  Number.isFinite(tm) &&
                  tm >= 1 &&
                  tm <= 12 &&
                  (tm !== month || ty !== year)
                ) {
                  setMonth(tm);
                  setYear(ty);
                }
              }
              if (!activeAccountId) return;
              if (opts?.recurringTouch) {
                invalidateNext12CalendarMonths(activeAccountId);
                mutate(calendarMonthSwrKey(month, year, activeAccountId));
                if (needDaySheetMonth) {
                  mutate(
                    calendarMonthSwrKey(effMonth, effYear, activeAccountId),
                  );
                }
              } else {
                mutate(calendarMonthSwrKey(month, year, activeAccountId));
                if (needDaySheetMonth) {
                  mutate(
                    calendarMonthSwrKey(effMonth, effYear, activeAccountId),
                  );
                }
                mutate(transactionsSwrKey(activeAccountId));
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
