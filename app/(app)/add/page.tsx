"use client";

import { Suspense, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarIcon, Repeat } from "lucide-react";
import { format, parseISO } from "date-fns";
import useSWR from "swr";
import { mutate } from "swr";
import { invalidateNext12CalendarMonths } from "@/lib/swr-invalidate";
import { calendarMonthSwrKey, transactionsSwrKey } from "@/lib/swr-keys";
import { fetchCategories } from "@/lib/api";
import { categoriesSwrKey } from "@/lib/swr-keys";
import { useActiveAccount } from "@/components/active-account-provider";
import { GlassCategorySelectTrigger } from "@/components/glass-category-select-trigger";
import {
  createTransaction,
  createRecurringRule,
  updateTransaction,
  makeTransactionRecurring,
} from "@/lib/transactions-mutations";
import { ErrorBanner } from "@/components/error-banner";
import { GlassExpenseIncomeToggle } from "@/components/glass-expense-income-toggle";
import { GlassIconButton } from "@/components/glass-icon-button";
import { InlineError } from "@/components/inline-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/currency-input";
import { Label } from "@/components/ui/label";
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
import { Switch } from "@/components/ui/switch";
import { RecurringEditScopeDialog } from "@/components/recurring-edit-scope-dialog";
import { USER_FACING_ERROR } from "@/lib/errors";
import { useSortedCategories } from "@/hooks/use-sorted-categories";
import { useRecurringEditScope } from "@/hooks/use-recurring-edit-scope";
import { useEditLoader } from "@/hooks/use-edit-loader";
import {
  glassAmountInputClass,
  glassCurrencyPrefixClass,
  glassInputClass,
  glassSectionIconClass,
} from "@/lib/glass-classes";
import { cn } from "@/lib/utils";

function getInitialDate(
  searchParams: ReturnType<typeof useSearchParams>,
): Date {
  const dateParam = searchParams.get("date");
  if (!dateParam) return new Date();
  try {
    const d = parseISO(dateParam);
    return isNaN(d.getTime()) ? new Date() : d;
  } catch {
    return new Date();
  }
}

const NO_CATEGORY_VALUE = "__none__";

function AddTransactionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editParam = searchParams.get("edit");
  const editRuleId = editParam?.startsWith("rule:") ? editParam.slice(5) : null;
  const editTxId = editParam && !editRuleId ? editParam : null;
  const isEditMode = !!editTxId || !!editRuleId;
  const fromTransactions = searchParams.get("from") === "transactions";

  const [label, setLabel] = useState(() => searchParams.get("initLabel") ?? "");
  const [amount, setAmount] = useState(() => searchParams.get("initAmount") ?? "");
  const [type, setType] = useState<"expense" | "income">(() =>
    searchParams.get("initType") === "income" ? "income" : "expense",
  );
  const [categoryId, setCategoryId] = useState<string | null>(() =>
    searchParams.get("initCategory"),
  );
  const [date, setDate] = useState<Date | undefined>(() =>
    getInitialDate(searchParams),
  );
  const [recurring, setRecurring] = useState(
    () => searchParams.get("initRecurring") === "true",
  );
  const [frequency, setFrequency] = useState<"weekly" | "biweekly" | "monthly" | "yearly">(() => {
    const f = searchParams.get("initFrequency");
    if (f === "weekly" || f === "biweekly" || f === "monthly" || f === "yearly") return f;
    return "monthly";
  });
  const [endCondition, setEndCondition] = useState<"none" | "date" | "count">(() => {
    return searchParams.get("initEndDate") ? "date" : "none";
  });
  const [endDate, setEndDate] = useState<Date | undefined>(() => {
    const initEndDate = searchParams.get("initEndDate");
    if (!initEndDate) return undefined;
    try {
      const d = parseISO(initEndDate);
      return isNaN(d.getTime()) ? undefined : d;
    } catch {
      return undefined;
    }
  });
  const [endDatePickerOpen, setEndDatePickerOpen] = useState(false);
  const [recurrenceCount, setRecurrenceCount] = useState("12");
  const { activeAccountId } = useActiveAccount();
  const accountId = activeAccountId;
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const hasInitialData = isEditMode && searchParams.get("initPrefilled") === "1";
  const scope = useRecurringEditScope(accountId);
  const {
    loading: editLoading,
    error: editLoadError,
    retry: retryEditLoad,
  } = useEditLoader(editTxId, editRuleId, searchParams.get("date"), {
    setLabel,
    setAmount,
    setType,
    setCategoryId,
    setDate,
    setRecurring,
    setFrequency,
    setScopeOccurrenceDate: scope.setOccurrenceDate,
    setScopeNextSegmentDate: scope.setNextSegmentDate,
    setScopeNextSegmentLoading: scope.setNextSegmentLoading,
    setEndCondition,
    setEndDate,
  }, hasInitialData);

  const { data: categories = [] } = useSWR(
    accountId ? categoriesSwrKey(accountId) : null,
    () => fetchCategories(accountId as string),
  );
  const sortedCategories = useSortedCategories(categories, type);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!accountId || !date) return;
    const parsedAmount = parseFloat(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a valid amount");
      return;
    }
    const finalAmount =
      type === "expense"
        ? -Math.abs(parsedAmount)
        : Math.abs(parsedAmount);
    const dateStr = format(date, "yyyy-MM-dd");
    startTransition(async () => {
      if (isEditMode && editTxId) {
        if (recurring) {
          const { error: recurringError } = await makeTransactionRecurring(editTxId, {
            accountId,
            label: label.trim(),
            amount: finalAmount,
            startDate: dateStr,
            category_id: categoryId,
            frequency,
            endDate:
              endCondition === "date" && endDate
                ? format(endDate, "yyyy-MM-dd")
                : null,
            recurrenceCount:
              endCondition === "count" && recurrenceCount
                ? parseInt(recurrenceCount, 10)
                : null,
          });
          if (recurringError) {
            setError(USER_FACING_ERROR);
            return;
          }
          invalidateNext12CalendarMonths(accountId);
          mutate(transactionsSwrKey(accountId));
          router.push(fromTransactions ? "/transactions" : `/?selected=${dateStr}`);
          return;
        }
        const { error: updateError } = await updateTransaction(editTxId, {
          label: label.trim(),
          amount: finalAmount,
          date: dateStr,
          category_id: categoryId,
        });
        if (updateError) {
          setError(USER_FACING_ERROR);
          return;
        }
        const currentMonth = date.getMonth() + 1;
        const currentYear = date.getFullYear();
        mutate(calendarMonthSwrKey(currentMonth, currentYear, accountId));
        mutate(transactionsSwrKey(accountId));
        router.push(fromTransactions ? "/transactions" : `/?selected=${dateStr}`);
        return;
      }

      if (isEditMode && editRuleId) {
        const dateFromParams = searchParams.get("date");
        const occurrenceDate =
          dateFromParams && dateFromParams.length >= 10
            ? dateFromParams.slice(0, 10)
            : date
              ? format(date, "yyyy-MM-dd")
              : format(new Date(), "yyyy-MM-dd");
        scope.openScope({
          ruleId: editRuleId,
          label: label.trim(),
          amount: finalAmount,
          frequency,
          category_id: categoryId,
          occurrenceDate,
          newStartDate: dateStr,
          endDate:
            endCondition === "date" && endDate
              ? format(endDate, "yyyy-MM-dd")
              : null,
          recurrenceCount:
            endCondition === "count" && recurrenceCount
              ? parseInt(recurrenceCount, 10)
              : null,
        });
        return;
      }

      if (recurring) {
        const { error: insertError } = await createRecurringRule({
          accountId,
          label: label.trim(),
          amount: finalAmount,
          frequency,
          startDate: dateStr,
          category_id: categoryId,
          endDate:
            endCondition === "date" && endDate
              ? format(endDate, "yyyy-MM-dd")
              : null,
          recurrenceCount:
            endCondition === "count" && recurrenceCount
              ? parseInt(recurrenceCount, 10)
              : null,
        });
        if (insertError) {
          setError(USER_FACING_ERROR);
          return;
        }
        invalidateNext12CalendarMonths(accountId);
      } else {
        const { error: insertError } = await createTransaction({
          accountId,
          label: label.trim(),
          amount: finalAmount,
          date: dateStr,
          category_id: categoryId,
        });
        if (insertError) {
          setError(USER_FACING_ERROR);
          return;
        }
        const currentMonth = date.getMonth() + 1;
        const currentYear = date.getFullYear();
        mutate(calendarMonthSwrKey(currentMonth, currentYear, accountId));
        mutate(transactionsSwrKey(accountId));
      }
      router.push(`/?selected=${dateStr}`);
    });
  }

  function confirmRecurringEditScope(s: "once" | "fromDate") {
    setError(null);
    if (!accountId) return;
    startTransition(async () => {
      try {
        const result = await scope.confirmScope(s);
        if (!result) {
          setError(USER_FACING_ERROR);
          return;
        }
        invalidateNext12CalendarMonths(accountId);
        router.push(fromTransactions ? "/transactions" : `/?selected=${result.targetDate}`);
      } catch {
        setError(USER_FACING_ERROR);
      }
    });
  }

  const submitButtonClass =
    "mt-2 h-12 border border-white/20 bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 active:bg-primary/80";

  return (
    <div className="flex flex-col pb-6">
      {/* Header */}
      <header className="page-enter-1 flex items-center gap-3 px-5 pb-4 pt-6">
        <GlassIconButton
          onClick={() => router.back()}
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </GlassIconButton>
        <h1 className="text-xl font-semibold text-white">
          {isEditMode ? "Edit Transaction" : "Add Transaction"}
        </h1>
      </header>

      <RecurringEditScopeDialog
        open={scope.scopeDialogOpen}
        onOpenChange={(open) => !open && scope.cancelScope()}
        onSelectScope={confirmRecurringEditScope}
        isPending={isPending}
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-5 pb-8">
        <div className="page-enter-2 flex flex-col gap-5">
          {/* Type toggle */}
          <GlassExpenseIncomeToggle value={type} onChange={setType} />

          {/* Amount */}
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="amount"
              className="text-sm font-medium text-white/70"
            >
              Amount
            </Label>
            <div className="relative">
              <span className={glassCurrencyPrefixClass}>$</span>
              <CurrencyInput
                id="amount"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={cn(
                  glassAmountInputClass,
                  "placeholder:text-white/40",
                )}
                required
              />
            </div>
          </div>

          {/* Label */}
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="label"
              className="text-sm font-medium text-white/70"
            >
              Label
            </Label>
            <Input
              id="label"
              type="text"
              placeholder="e.g. Grocery Store"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className={glassInputClass}
              required
            />
          </div>

          {/* Category */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-white/70">
              Category
            </Label>
            <GlassCategorySelectTrigger
              value={categoryId}
              noCategoryValue={NO_CATEGORY_VALUE}
              onValueChange={(v) =>
                setCategoryId(v === NO_CATEGORY_VALUE ? null : v)
              }
              categories={sortedCategories}
            />
          </div>

          {/* Date */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-white/70">Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="glass"
                  className={cn(
                    "h-11 w-full justify-start text-left font-normal text-white placeholder:text-white/40",
                    !date && "text-white/60",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-white/70" />
                  {date ? format(date, "MMM d, yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  defaultMonth={date}
                  onSelect={setDate}
                  initialFocus
                  disabled={
                    scope.nextSegmentLoading
                      ? () => true
                      : editRuleId
                        ? (d) => {
                            const ds = format(d, "yyyy-MM-dd");
                            const tooEarly =
                              scope.occurrenceDate != null &&
                              ds < scope.occurrenceDate;
                            const tooLate = scope.nextSegmentDate
                              ? ds >= scope.nextSegmentDate
                              : false;
                            return tooEarly || tooLate;
                          }
                        : undefined
                  }
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Recurring */}
          <div className="glass-card flex flex-col gap-4 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={glassSectionIconClass}>
                  <Repeat className="h-4 w-4 text-primary" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-white">
                    Recurring
                  </span>
                  <span className="text-xs text-white/60">
                    Repeat this transaction
                  </span>
                </div>
              </div>
              <Switch
                checked={recurring}
                onCheckedChange={setRecurring}
                disabled={!!editRuleId}
                aria-label="Toggle recurring"
              />
            </div>

            {recurring && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium text-white/70">
                    Frequency
                  </Label>
                  <Select value={frequency} onValueChange={(v) => setFrequency(v as "weekly" | "biweekly" | "monthly" | "yearly")}>
                    <SelectTrigger className="h-11 rounded-xl border-white/20 bg-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Biweekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium text-white/70">
                    End
                  </Label>
                  <div className="flex gap-2">
                    {(["none", "date", "count"] as const).map((cond) => (
                      <button
                        key={cond}
                        type="button"
                        onClick={() => setEndCondition(cond)}
                        className={cn(
                          "flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
                          endCondition === cond
                            ? "border-primary bg-primary/20 text-white"
                            : "border-white/20 bg-white/10 text-white/60 hover:text-white",
                        )}
                      >
                        {cond === "none"
                          ? "No end"
                          : cond === "date"
                            ? "End date"
                            : "# of times"}
                      </button>
                    ))}
                  </div>

                  {endCondition === "date" && (
                    <Popover
                      open={endDatePickerOpen}
                      onOpenChange={setEndDatePickerOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="glass"
                          className={cn(
                            "h-11 w-full justify-start text-left font-normal text-white placeholder:text-white/40",
                            !endDate && "text-white/60",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 text-white/70" />
                          {endDate
                            ? format(endDate, "MMM d, yyyy")
                            : "Pick end date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={endDate}
                          defaultMonth={endDate ?? date}
                          onSelect={(d) => {
                            setEndDate(d);
                            setEndDatePickerOpen(false);
                          }}
                          disabled={
                            date
                              ? (d) =>
                                  format(d, "yyyy-MM-dd") <=
                                  format(date, "yyyy-MM-dd")
                              : undefined
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  )}

                  {endCondition === "count" && (
                    <div className="flex flex-col gap-1">
                      <Input
                        type="number"
                        min="1"
                        max="9999"
                        placeholder="e.g. 12"
                        value={recurrenceCount}
                        onChange={(e) => setRecurrenceCount(e.target.value)}
                        className={glassInputClass}
                      />
                      <p className="text-xs text-white/50">
                        Number of times this repeats
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="page-enter-3 flex flex-col gap-2">
          {editLoadError && (
            <ErrorBanner
              variant="inline"
              message={editLoadError}
              onRetry={retryEditLoad}
            />
          )}
          {error && <InlineError>{error}</InlineError>}

          {/* Submit */}
          <Button
            type="submit"
            disabled={!accountId || editLoading || isPending}
            className={submitButtonClass}
          >
            {editLoading
              ? "Loading…"
              : isPending
                ? "Saving…"
                : isEditMode
                  ? type === "income"
                    ? "Update Income"
                    : "Update Expense"
                  : type === "income"
                    ? "Add Income"
                    : "Add Expense"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function AddPage() {
  return (
    <Suspense fallback={<div />}>
      <AddTransactionPage />
    </Suspense>
  );
}
