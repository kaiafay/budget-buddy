"use client";

import { useEffect, useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { useSwipeable } from "react-swipeable";
import {
  CalendarIcon,
  Filter,
  Pencil,
  Plus,
  Receipt,
  Repeat,
  Search,
  Trash2,
  X,
} from "lucide-react";
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
import { invalidateNext12CalendarMonths } from "@/lib/swr-invalidate";
import { AmountText } from "@/components/amount-text";
import { ErrorBanner } from "@/components/error-banner";
import { InlineError } from "@/components/inline-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { glassInputClass } from "@/lib/glass-classes";
import { createClient } from "@/lib/supabase/client";
import { MakeRecurringDialog } from "@/components/make-recurring-dialog";

const ROW_ACTIONS_WIDTH_2 = 136;
const ROW_ACTIONS_WIDTH_3 = 188;

const ALL_CATEGORIES_VALUE = "__all__";

const swipeActionButtonClass =
  "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-white active:brightness-90";


function SwipeableTransactionRow({
  t,
  category,
  isOpen,
  isDeleting,
  onOpen,
  onClose,
  onDelete,
  onEdit,
  onMakeRecurring,
}: {
  t: Transaction;
  category?: Category | null;
  isOpen: boolean;
  isDeleting: boolean;
  onOpen: () => void;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onMakeRecurring?: () => void;
}) {
  const actionsWidth = onMakeRecurring
    ? ROW_ACTIONS_WIDTH_3
    : ROW_ACTIONS_WIDTH_2;

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
            ? `translateX(-${actionsWidth}px)`
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
          <AmountText amount={t.amount} className="shrink-0" variant="list" />
        </div>

        <div
          className="absolute flex items-center gap-2 pr-2"
          style={{
            right: `-${actionsWidth}px`,
            top: 0,
            height: "100%",
          }}
        >
          {onMakeRecurring && (
            <button
              type="button"
              onClick={onMakeRecurring}
              className={swipeActionButtonClass}
              style={{
                background: "rgba(79,107,237,0.7)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.3)",
              }}
              aria-label="Make recurring"
            >
              <Repeat className="h-4 w-4" />
            </button>
          )}
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
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
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
  const [isDeleting, startDeleteTransition] = useTransition();

  const [filterStart, setFilterStart] = useState<Date>(() =>
    startOfMonth(new Date()),
  );
  const [filterEnd, setFilterEnd] = useState<Date>(() =>
    endOfMonth(new Date()),
  );
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersPopoverOpen, setFiltersPopoverOpen] = useState(false);
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);

  const [makeRecurringTx, setMakeRecurringTx] = useState<Transaction | null>(
    null,
  );
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    async function loadAccount() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: acct } = await supabase
        .from("accounts")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (acct?.id) setAccountId(acct.id);
    }
    void loadAccount();
  }, []);

  const filterStartStr = format(filterStart, "yyyy-MM-dd");
  const filterEndStr = format(filterEnd, "yyyy-MM-dd");
  const defaultFilterStartStr = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const defaultFilterEndStr = format(endOfMonth(new Date()), "yyyy-MM-dd");
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    filterCategoryId !== null ||
    filterStartStr !== defaultFilterStartStr ||
    filterEndStr !== defaultFilterEndStr;

  const hasStructuredFiltersActive =
    filterCategoryId !== null ||
    filterStartStr !== defaultFilterStartStr ||
    filterEndStr !== defaultFilterEndStr;

  const transactionsList: Transaction[] = useMemo(() => {
    if (!data) return [];

    const txRows = (data.transactions ?? [])
      .filter((row) => row.date >= filterStartStr && row.date <= filterEndStr)
      .map((row) => ({
        id: row.id,
        label: row.label,
        amount: Number(row.amount),
        date: row.date,
        category_id: row.category_id ?? null,
      }));

    const rules = (data.recurringRules ?? []).map(mapRecurringRuleRow);

    const expanded = expandRecurringForDateRange(
      rules,
      filterStartStr,
      filterEndStr,
      data.exceptions ?? [],
    );

    return [...txRows, ...expanded];
  }, [data, filterStartStr, filterEndStr]);

  const filteredList: Transaction[] = useMemo(() => {
    let result = transactionsList;

    if (filterCategoryId) {
      result = result.filter((t) => t.category_id === filterCategoryId);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((t) => {
        const categoryName =
          categories.find((c) => c.id === t.category_id)?.name ?? "";
        return (
          t.label.toLowerCase().includes(q) ||
          categoryName.toLowerCase().includes(q) ||
          t.date.includes(q) ||
          format(parseISO(t.date), "EEEE, MMM d").toLowerCase().includes(q)
        );
      });
    }

    return result;
  }, [transactionsList, filterCategoryId, searchQuery, categories]);

  const grouped = useMemo(
    () => groupTransactionsByDate(filteredList),
    [filteredList],
  );

  function handleDelete(t: Transaction) {
    setDeleteError(null);
    startDeleteTransition(async () => {
      try {
        if (t.recurring) {
          const { ruleId, date: exceptionDate } = getRecurringRuleIdAndDate(
            t.id,
          );
          const { error } = await skipRecurringOccurrence(ruleId, exceptionDate);
          if (error) {
            setDeleteError(USER_FACING_ERROR);
            return;
          }
        } else {
          const { error } = await deleteTransaction(t.id);
          if (error) {
            setDeleteError(USER_FACING_ERROR);
            return;
          }
        }
        setOpenedRowId(null);
        invalidateAfterLocalDelete(t.date, mutate);
      } catch {
        setDeleteError(USER_FACING_ERROR);
      }
    });
  }

  function handleEdit(t: Transaction) {
    setOpenedRowId(null);
    const initParams = new URLSearchParams({
      from: "transactions",
      initPrefilled: "1",
      initLabel: t.label,
      initAmount: Math.abs(t.amount).toFixed(2),
      initType: t.amount >= 0 ? "income" : "expense",
      ...(t.category_id ? { initCategory: t.category_id } : {}),
    });
    if (t.recurring) {
      const { ruleId } = getRecurringRuleIdAndDate(t.id);
      const rule = data?.recurringRules.find((r) => r.id === ruleId);
      initParams.set("initRecurring", "true");
      if (rule?.frequency) initParams.set("initFrequency", rule.frequency);
      if (rule?.end_date) initParams.set("initEndDate", rule.end_date);
      router.push(`/add?edit=rule:${ruleId}&date=${t.date}&${initParams}`);
    } else {
      router.push(`/add?edit=${t.id}&date=${t.date}&${initParams}`);
    }
  }

  function handleMakeRecurringSuccess() {
    setMakeRecurringTx(null);
    setOpenedRowId(null);
    invalidateNext12CalendarMonths();
    mutate("transactions");
  }

  const filterBarClass =
    "h-9 rounded-xl border-white/20 bg-white/10 text-sm text-white";

  return (
    <div className="flex flex-col overflow-x-hidden">
      {makeRecurringTx && (
        <MakeRecurringDialog
          transaction={makeRecurringTx}
          accountId={accountId}
          onClose={() => setMakeRecurringTx(null)}
          onSuccess={handleMakeRecurringSuccess}
        />
      )}

      <header className="page-enter-1 px-5 pb-4 pt-6">
        <h1 className="text-xl font-semibold text-white">Transactions</h1>
        <p className="text-sm text-white/70">
          {format(filterStart, "MMM d")} – {format(filterEnd, "MMM d, yyyy")}
        </p>
      </header>

      {/* Search bar + filter popover */}
      <div className="page-enter-2 flex items-center gap-2 px-5 pb-4">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
          <Input
            placeholder="Search transactions…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(glassInputClass, "pl-9 pr-9")}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Popover open={filtersPopoverOpen} onOpenChange={setFiltersPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="glass"
              size="icon"
              className="relative h-9 w-9 shrink-0 rounded-xl border-white/20"
              aria-label={
                hasStructuredFiltersActive
                  ? "Filters (active)"
                  : "Open filters"
              }
            >
              <Filter className="h-4 w-4 text-white/80" />
              {hasStructuredFiltersActive ? (
                <span
                  className="absolute right-1.5 top-1.5 size-2 rounded-full border border-primary bg-white shadow-sm"
                  aria-hidden
                />
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className="w-[min(calc(100vw-2.5rem),20rem)] border-0 bg-transparent p-0 text-white shadow-none outline-none"
          >
            <div className="flex flex-col rounded-2xl bg-primary text-primary-foreground shadow-lg">
              <div className="flex items-center justify-between gap-2 border-b border-white/15 px-4 py-3">
                <span className="text-sm font-medium text-white">Filters</span>
                <button
                  type="button"
                  onClick={() => setFiltersPopoverOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Close filters"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                  <Popover
                    open={startPickerOpen}
                    onOpenChange={setStartPickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="glass"
                        className={cn(
                          filterBarClass,
                          "min-w-0 flex-1 justify-start font-normal",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0 text-white/70" />
                        <span className="truncate">
                          {format(filterStart, "MMM d, yyyy")}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={filterStart}
                        defaultMonth={filterStart}
                        onSelect={(d) => {
                          if (d) {
                            setFilterStart(d);
                            if (d > filterEnd) setFilterEnd(d);
                            setStartPickerOpen(false);
                          }
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  <span className="shrink-0 text-xs text-white/50">to</span>

                  <Popover
                    open={endPickerOpen}
                    onOpenChange={setEndPickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="glass"
                        className={cn(
                          filterBarClass,
                          "min-w-0 flex-1 justify-start font-normal",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0 text-white/70" />
                        <span className="truncate">
                          {format(filterEnd, "MMM d, yyyy")}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={filterEnd}
                        defaultMonth={filterEnd}
                        onSelect={(d) => {
                          if (d) {
                            setFilterEnd(d);
                            if (d < filterStart) setFilterStart(d);
                            setEndPickerOpen(false);
                          }
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <Select
                  value={filterCategoryId ?? ALL_CATEGORIES_VALUE}
                  onValueChange={(v) =>
                    setFilterCategoryId(v === ALL_CATEGORIES_VALUE ? null : v)
                  }
                >
                  <SelectTrigger className={cn(filterBarClass, "w-full")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_CATEGORIES_VALUE}>
                      All categories
                    </SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {hasStructuredFiltersActive ? (
                  <button
                    type="button"
                    className="text-center text-sm font-medium text-white/85 underline decoration-white/40 underline-offset-2 hover:text-white hover:decoration-white/70"
                    onClick={() => {
                      const now = new Date();
                      setFilterStart(startOfMonth(now));
                      setFilterEnd(endOfMonth(now));
                      setFilterCategoryId(null);
                    }}
                  >
                    Clear all
                  </button>
                ) : null}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="page-enter-3 flex flex-col gap-6 px-5 pb-6">
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
                  {hasActiveFilters
                    ? "No transactions match your filters."
                    : "No transactions yet"}
                </p>
                <p className="text-sm text-white/70">
                  {hasActiveFilters
                    ? "Try adjusting your search or filters."
                    : "When you add income or expenses, they&apos;ll show up here."}
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
                  isDeleting={isDeleting}
                  onOpen={() => setOpenedRowId(t.id)}
                  onClose={() => setOpenedRowId(null)}
                  onDelete={() => handleDelete(t)}
                  onEdit={() => handleEdit(t)}
                  onMakeRecurring={
                    t.recurring
                      ? undefined
                      : () => {
                          setOpenedRowId(null);
                          setMakeRecurringTx(t);
                        }
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
