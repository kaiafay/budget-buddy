"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { useSwipeable } from "react-swipeable";
import { DollarSign, ArrowDownLeft, Pencil, Trash2 } from "lucide-react";
import useSWR, { useSWRConfig } from "swr";
import type { Transaction, GroupedTransactions } from "@/lib/types";
import { fetchTransactions } from "@/lib/api";
import { expandRecurringForDateRange } from "@/lib/projection";
import {
  deleteTransaction,
  skipRecurringOccurrence,
} from "@/lib/transactions-mutations";

const ROW_ACTIONS_WIDTH = 136;

function SwipeableTransactionRow({
  t,
  isOpen,
  onOpen,
  onClose,
  onDelete,
  onEdit,
}: {
  t: Transaction;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const swipeable = useSwipeable({
    onSwipedLeft: onOpen,
    onSwipedRight: onClose,
    preventScrollOnSwipe: true,
    trackMouse: true,
  });
  return (
    <div
        className="relative overflow-hidden rounded-xl"
        ref={swipeable.ref}
        onMouseDown={swipeable.onMouseDown}
      >
      <div
        className="relative flex items-center transition-transform duration-200 ease-out"
        style={{
          transform: isOpen
            ? `translateX(-${ROW_ACTIONS_WIDTH}px)`
            : "translateX(0)",
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">
          {t.amount > 0 ? (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
              <DollarSign className="h-4 w-4 text-white" />
            </div>
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <ArrowDownLeft className="h-4 w-4 text-white/70" />
            </div>
          )}
          <div className="min-w-0 flex-1">
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
                ? "amount-text shrink-0 text-sm font-semibold tabular-nums text-[var(--amount-positive)]"
                : "shrink-0 text-sm font-semibold tabular-nums text-[var(--amount-negative)]"
            }
          >
            {t.amount >= 0 ? "+" : "-"}$
            {Math.abs(t.amount).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>

        <div
          className="absolute flex items-center gap-2 pr-2"
          style={{
            right: `-${ROW_ACTIONS_WIDTH}px`,
            top: 0,
            height: "100%",
          }}
        >
          <button
            type="button"
            onClick={onDelete}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-white"
            style={{
              background: "rgba(220,38,38,0.85)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.2)",
            }}
            aria-label="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-white"
            style={{
              background: "rgba(255,255,255,0.2)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.3)",
            }}
            aria-label="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data } = useSWR("transactions", fetchTransactions);
  const [openedRowId, setOpenedRowId] = useState<string | null>(null);

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

  async function handleDelete(t: Transaction) {
    if (t.recurring) {
      const ruleId = t.id.slice(0, -11);
      const exceptionDate = t.date;
      const { error } = await skipRecurringOccurrence(ruleId, exceptionDate);
      if (!error) {
        setOpenedRowId(null);
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        mutate(`calendar-month-${month}-${year}`);
        mutate("transactions");
      }
    } else {
      const { error } = await deleteTransaction(t.id);
      if (!error) {
        setOpenedRowId(null);
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        mutate(`calendar-month-${month}-${year}`);
        mutate("transactions");
      }
    }
  }

  function handleEdit(t: Transaction) {
    setOpenedRowId(null);
    if (t.recurring) {
      const ruleId = t.id.slice(0, -11);
      router.push(`/add?edit=rule:${ruleId}&date=${t.date}`);
    } else {
      router.push(`/add?edit=${t.id}`);
    }
  }

  return (
    <div className="flex flex-col overflow-x-hidden">
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
            <div className="glass-card flex flex-col gap-1 overflow-visible rounded-2xl p-2">
              {group.transactions.map((t) => (
                <SwipeableTransactionRow
                  key={t.id}
                  t={t}
                  isOpen={openedRowId === t.id}
                  onOpen={() => setOpenedRowId(t.id)}
                  onClose={() => setOpenedRowId(null)}
                  onDelete={() => handleDelete(t)}
                  onEdit={() => handleEdit(t)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
