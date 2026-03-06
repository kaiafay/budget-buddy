"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DayTransactionsContent } from "@/components/day-sheet";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface CalendarGridProps {
  balances: Record<string, number>;
  transactions: Transaction[];
  balanceYear: number;
  balanceMonth: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  isLoading?: boolean;
}

export function CalendarGrid({
  balances,
  transactions,
  balanceYear,
  balanceMonth,
  onPrevMonth,
  onNextMonth,
  isLoading = false,
}: CalendarGridProps) {
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const transactionsByMonthRef = useRef<Record<string, Transaction[]>>({});

  const daysInMonth = new Date(balanceYear, balanceMonth, 0).getDate();
  const firstDayOfWeek = new Date(balanceYear, balanceMonth - 1, 1).getDay();

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const currentMonthKey = `${balanceYear}-${String(balanceMonth).padStart(2, "0")}`;
  const firstDayOfMonth = `${currentMonthKey}-01`;

  useEffect(() => {
    transactionsByMonthRef.current[currentMonthKey] = transactions;
  }, [currentMonthKey, transactions]);

  function handleDayClick(day: number) {
    const dateStr = `${balanceYear}-${String(balanceMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedDate(dateStr);
  }

  const effectiveDate = useMemo(() => {
    if (selectedDate) return selectedDate;
    const todayInCurrentMonth = todayStr.slice(0, 7) === currentMonthKey;
    return todayInCurrentMonth ? todayStr : firstDayOfMonth;
  }, [selectedDate, todayStr, currentMonthKey, firstDayOfMonth]);

  const effectiveTransactions: Transaction[] = useMemo(() => {
    const monthKey = effectiveDate.slice(0, 7);
    const list =
      monthKey === currentMonthKey
        ? transactions
        : (transactionsByMonthRef.current[monthKey] ?? []);
    return list
      .filter((t) => t.date === effectiveDate)
      .map((t) => ({
        id: t.id,
        label: t.label,
        amount: t.amount,
        date: t.date,
        recurring: t.recurring ?? false,
      }));
  }, [effectiveDate, currentMonthKey, transactions]);

  return (
    <>
      {/* Month header */}
      <div
        className={cn(
          "flex items-center justify-between px-5 pb-4 pt-6",
          isLoading && "opacity-60 transition-opacity",
        )}
      >
        <button
          onClick={onPrevMonth}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-semibold text-white">
          {MONTH_NAMES[balanceMonth - 1]} {balanceYear}
        </h2>
        <button
          onClick={onNextMonth}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 px-3">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-xs font-medium text-white/60"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px px-3 pb-4">
        {/* Empty cells for offset */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${balanceYear}-${String(balanceMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const balance =
            balances[dateStr] !== undefined ? balances[dateStr] : undefined;
          const isToday = dateStr === todayStr;
          const isNegative = balance !== undefined && balance < 0;

          return (
            <button
              key={day}
              onClick={() => handleDayClick(day)}
              className={cn(
                "glass-cell flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl transition-colors",
                isToday && "glass-cell-today",
                !isToday && isNegative && "glass-cell-negative",
                !isToday && "hover:opacity-90",
              )}
              aria-label={`${MONTH_NAMES[balanceMonth - 1]} ${day}`}
            >
              <span
                className={cn(
                  "text-sm font-medium text-white",
                  isToday && "font-semibold",
                )}
              >
                {day}
              </span>
              {balance !== undefined && (
                <span
                  className={cn(
                    "text-[10px] leading-none font-medium tabular-nums",
                    isToday
                      ? "amount-text text-white/90"
                      : balance >= 0
                        ? "amount-text text-[var(--amount-positive)]"
                        : "amount-text-negative text-[var(--amount-negative)]",
                  )}
                >
                  {balance >= 0 ? "" : "-"}$
                  {Math.abs(balance).toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Day transactions: selected day (from cache if different month), or today / first of month */}
      <DayTransactionsContent
        date={effectiveDate}
        transactions={effectiveTransactions}
      />
    </>
  );
}
