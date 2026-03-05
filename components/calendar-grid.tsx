"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDailyBalance, getTransactionsForDate } from "@/lib/mock-data";
import { DaySheet } from "@/components/day-sheet";

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

export function CalendarGrid() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1); // 1-based
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const dailyBalances = useMemo(
    () => getDailyBalance(currentYear, currentMonth),
    [currentYear, currentMonth],
  );

  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay();

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  function prevMonth() {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  }

  function nextMonth() {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  }

  function handleDayClick(day: number) {
    const dateStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedDate(dateStr);
  }

  const selectedTransactions = selectedDate
    ? getTransactionsForDate(selectedDate)
    : [];

  return (
    <>
      {/* Month header */}
      <div className="flex items-center justify-between px-5 pb-4 pt-6">
        <button
          onClick={prevMonth}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-semibold text-foreground">
          {MONTH_NAMES[currentMonth - 1]} {currentYear}
        </h2>
        <button
          onClick={nextMonth}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
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
            className="py-2 text-center text-xs font-medium text-muted-foreground"
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
          const dateStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const balance = dailyBalances.get(day);
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
              aria-label={`${MONTH_NAMES[currentMonth - 1]} ${day}`}
            >
              <span
                className={cn(
                  "text-sm font-medium",
                  isToday && "text-white",
                )}
              >
                {day}
              </span>
              {balance !== undefined && (
                <span
                  className={cn(
                    "text-[10px] leading-none font-medium tabular-nums",
                    isToday
                      ? "text-white/80"
                      : balance >= 0
                        ? "text-[#22C55E]"
                        : "text-[#EF4444]",
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

      {/* Day bottom sheet */}
      <DaySheet
        open={selectedDate !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDate(null);
        }}
        date={selectedDate}
        transactions={selectedTransactions}
      />
    </>
  );
}
