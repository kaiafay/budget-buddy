"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { CalendarGrid } from "@/components/calendar-grid";
import { mockSettings, getTransactionsForMonth } from "@/lib/mock-data";
import { useMemo, useState } from "react";

export function CalendarView() {
  const today = new Date();
  const [month] = useState(today.getMonth() + 1);
  const [year] = useState(today.getFullYear());

  const monthTransactions = useMemo(
    () => getTransactionsForMonth(year, month),
    [year, month],
  );

  const monthIncome = monthTransactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const monthExpenses = monthTransactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);

  return (
    <div className="flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 pb-2 pt-4">
        <div>
          <p className="text-base font-normal text-muted-foreground">
            👋 Good morning
          </p>
          <h1 className="text-xl font-semibold text-foreground">
            {mockSettings.accountName}
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
            {monthExpenses.toLocaleString(undefined, {
              minimumFractionDigits: 2,
            })}
          </span>
        </div>
      </div>

      {/* Calendar */}
      <div className="mt-1 rounded-t-3xl bg-card pt-1 shadow-sm">
        <CalendarGrid />
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
