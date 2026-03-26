"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { useSwipeable } from "react-swipeable";
import { Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import useSWR, { useSWRConfig } from "swr";
import type { Category, Transaction, GroupedTransactions } from "@/lib/types";
import { fetchTransactions, fetchCategories } from "@/lib/api";
import { TransactionLeadingIcon } from "@/components/transaction-leading-icon";
import { expandRecurringForDateRange } from "@/lib/projection";
import { mapRecurringRuleRow, getRecurringRuleIdAndDate } from "@/lib/recurring-rules";
import {
  deleteTransaction,
  skipRecurringOccurrence,
} from "@/lib/transactions-mutations";
import { USER_FACING_ERROR } from "@/lib/errors";
import { calendarMonthSwrKey } from "@/lib/swr-keys";
import { AmountText } from "@/components/amount-text";
import { ErrorBanner } from "@/components/error-banner";
import { InlineError } from "@/components/inline-error";

const ROW_ACTIONS_WIDTH = 136;

const swipeActionButtonClass =
  "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-white active:brightness-90";

function SwipeableTransactionRow({
  t,
  category,
  isOpen,
  onOpen,
  onClose,
  onDelete,
  onEdit,
}: {
  t: Transaction;
  category?: Category | null;
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
          <TransactionLeadingIcon
            category={category}
            amount={t.amount}
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <span className="text-sm font-medium text-white">
              {t.label}
              {t.recurring && (
                <span className="ml-1 text-xs text-white/70">↻</span>
              )}
            </span>
          </div>
          <AmountText
            amount={t.amount}
            className="shrink-0"
            variant="list"
          />
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
            className={swipeActionButtonClass}
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
            className={swipeActionButtonClass}
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

function invalidateAfterLocalDelete(
  dateStr: string,
  mutate: (key: string) => void,
) {
  const deletedMonth = new Date(dateStr).getMonth() + 1;
  const deletedYear = new Date(dateStr).getFullYear();
  const now = new Date();
  mutate(calendarMonthSwrKey(deletedMonth, deletedYear));
  mutate(calendarMonthSwrKey(now.getMonth() + 1, now.getFullYear()));
  mutate("transactions");
}

export default function TransactionsPage() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const {
    data,
    error: transactionsFetchError,
    isLoading: transactionsLoading,
    mutate: revalidateTransactions,
  } = useSWR("transactions", fetchTransactions);
  const { data: categories = [] } = useSWR("categories", fetchCategories);
  const [openedRowId, setOpenedRowId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
      category_id: row.category_id ?? null,
    }));

    const rules = (data.recurringRules ?? []).map(mapRecurringRuleRow);

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
    setDeleteError(null);
    if (t.recurring) {
      const { ruleId, date: exceptionDate } = getRecurringRuleIdAndDate(t.id);
      const { error } = await skipRecurringOccurrence(ruleId, exceptionDate);
      if (error) {
        setDeleteError(USER_FACING_ERROR);
        return;
      }
      setOpenedRowId(null);
      invalidateAfterLocalDelete(t.date, mutate);
    } else {
      const { error } = await deleteTransaction(t.id);
      if (error) {
        setDeleteError(USER_FACING_ERROR);
        return;
      }
      setOpenedRowId(null);
      invalidateAfterLocalDelete(t.date, mutate);
    }
  }

  function handleEdit(t: Transaction) {
    setOpenedRowId(null);
    if (t.recurring) {
      const { ruleId } = getRecurringRuleIdAndDate(t.id);
      router.push(`/add?edit=rule:${ruleId}&date=${t.date}&from=transactions`);
    } else {
      router.push(`/add?edit=${t.id}&from=transactions`);
    }
  }

  return (
    <div className="flex flex-col overflow-x-hidden">
      <header className="page-enter-1 px-5 pb-4 pt-6">
        <h1 className="text-xl font-semibold text-white">Transactions</h1>
        <p className="text-sm text-white/70">All your recent activity</p>
      </header>

      <div className="flex flex-col gap-6 px-5 pb-6">
        {transactionsFetchError && (
          <ErrorBanner
            variant="panel"
            message="Couldn't load transactions. Check your connection and try again."
            onRetry={() => void revalidateTransactions()}
          />
        )}
        {deleteError && <InlineError>{deleteError}</InlineError>}
        {transactionsLoading && !data && !transactionsFetchError && (
          <p className="text-sm text-white/70">Loading…</p>
        )}
        {!transactionsLoading &&
          !transactionsFetchError &&
          grouped.length === 0 && (
            <div className="glass-card flex flex-col items-center gap-4 rounded-2xl px-6 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
                <Receipt className="h-7 w-7 text-white/80" aria-hidden />
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-white">
                  No transactions yet
                </p>
                <p className="text-sm text-white/70">
                  When you add income or expenses, they&apos;ll show up here.
                </p>
              </div>
              <Link
                href="/add"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/80"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add transaction
              </Link>
            </div>
          )}
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
                  category={
                    t.category_id
                      ? categories.find((c) => c.id === t.category_id) ?? null
                      : null
                  }
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
