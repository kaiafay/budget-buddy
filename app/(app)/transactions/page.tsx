"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { mockTransactions } from "@/lib/mock-data";
import { CategoryIcon } from "@/components/category-icon";
import { cn } from "@/lib/utils";

type GroupedTransactions = {
  date: string;
  formatted: string;
  transactions: typeof mockTransactions;
};

export default function TransactionsPage() {
  const grouped = useMemo(() => {
    const sorted = [...mockTransactions].sort((a, b) =>
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
  }, []);

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
                  <CategoryIcon category={t.category} />
                  <div className="flex flex-1 flex-col">
                    <span className="text-sm font-medium text-foreground">
                      {t.label}
                    </span>
                    <span className="text-xs capitalize text-muted-foreground">
                      {t.category}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      t.type === "income" ? "text-[#22C55E]" : "text-[#EF4444]",
                    )}
                  >
                    {t.type === "income" ? "+" : "-"}$
                    {t.amount.toLocaleString(undefined, {
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
