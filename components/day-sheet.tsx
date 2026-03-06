"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Plus, DollarSign, ArrowDownLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Transaction } from "@/lib/types";

export interface DayTransactionsContentProps {
  date: string;
  transactions: Transaction[];
}

/**
 * Inline day transactions block: "Month Day" header, count, list, net total, Add button.
 * Used below the calendar (today when no selection, selected day when selected).
 */
export function DayTransactionsContent({
  date,
  transactions,
}: DayTransactionsContentProps) {
  const monthDay = format(parseISO(date), "MMMM d");
  const dayTotal = transactions.reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="border-t border-white/20 px-5 pb-6 pt-4">
      <h3 className="text-overlay text-sm font-semibold text-white/90">
        {monthDay}
      </h3>
      <p className="text-overlay mt-0.5 text-xs text-white/70">
        {transactions.length === 0
          ? "No transactions on this day"
          : `${transactions.length} transaction${transactions.length > 1 ? "s" : ""}`}
      </p>

      <div className="mt-3 flex flex-col gap-1">
        {transactions.length > 0 && (
          <>
            {transactions.map((t) => (
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
                  <span className="text-overlay text-sm font-medium text-white">
                    {t.label}
                    {t.recurring && (
                      <span className="text-overlay ml-1 text-xs text-white/70">
                        ↻
                      </span>
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

            {transactions.length > 1 && (
              <div className="mt-1 flex items-center justify-between border-t border-white/20 px-3 pt-3">
                <span className="text-overlay text-sm font-medium text-white/70">
                  Net total
                </span>
                <span
                  className={
                    dayTotal >= 0
                      ? "amount-text text-sm font-semibold tabular-nums text-[var(--amount-positive)]"
                      : "text-sm font-semibold tabular-nums text-[var(--amount-negative)]"
                  }
                >
                  {dayTotal >= 0 ? "+" : "-"}$
                  {Math.abs(dayTotal).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <Button
        asChild
        className="mt-4 h-11 w-full rounded-xl border border-white/20 bg-primary text-white hover:bg-primary/90"
      >
        <Link href={`/add?date=${date}`}>
          <Plus className="mr-2 h-4 w-4" />
          Add transaction
        </Link>
      </Button>
    </div>
  );
}
