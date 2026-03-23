"use client";

import { useSwipeable } from "react-swipeable";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AmountText } from "@/components/amount-text";
import { GlassIconButton } from "@/components/glass-icon-button";
import { cn } from "@/lib/utils";

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
  balanceYear: number;
  balanceMonth: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  isLoading?: boolean;
  selectedDate: string | null;
  onSelectedDateChange: (date: string) => void;
}

export function CalendarGrid({
  balances,
  balanceYear,
  balanceMonth,
  onPrevMonth,
  onNextMonth,
  isLoading = false,
  selectedDate,
  onSelectedDateChange,
}: CalendarGridProps) {
  const today = new Date();

  const daysInMonth = new Date(balanceYear, balanceMonth, 0).getDate();
  const firstDayOfWeek = new Date(balanceYear, balanceMonth - 1, 1).getDay();

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const swipeable = useSwipeable({
    onSwipedLeft: onNextMonth,
    onSwipedRight: onPrevMonth,
    preventScrollOnSwipe: true,
    trackMouse: true,
  });

  function handleDayClick(day: number) {
    const dateStr = `${balanceYear}-${String(balanceMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onSelectedDateChange(dateStr);
  }

  return (
    <div ref={swipeable.ref} onMouseDown={swipeable.onMouseDown}>
      {/* Month header */}
      <div
        className={cn(
          "flex items-center justify-between px-5 pb-4 pt-6",
          isLoading && "opacity-60 transition-opacity",
        )}
      >
        <GlassIconButton onClick={onPrevMonth} aria-label="Previous month">
          <ChevronLeft className="h-5 w-5" />
        </GlassIconButton>
        <h2 className="text-lg font-semibold text-white">
          {MONTH_NAMES[balanceMonth - 1]} {balanceYear}
        </h2>
        <GlassIconButton onClick={onNextMonth} aria-label="Next month">
          <ChevronRight className="h-5 w-5" />
        </GlassIconButton>
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
          const isSelected = dateStr === selectedDate;

          return (
            <button
              key={day}
              onClick={() => handleDayClick(day)}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl hover:bg-white/10"
              aria-label={`${MONTH_NAMES[balanceMonth - 1]} ${day}`}
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-sm",
                  isToday
                    ? "bg-white/35 font-semibold text-white"
                    : "font-medium text-white/80",
                  isSelected && "ring-2 ring-white/50",
                )}
              >
                {day}
              </span>
              {balance !== undefined && (
                <AmountText
                  amount={balance}
                  variant="compact"
                  className={cn(
                    isToday
                      ? "amount-text text-white/90"
                      : balance >= 0
                        ? "amount-text text-[var(--amount-positive)]"
                        : "text-[var(--amount-negative)]",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
