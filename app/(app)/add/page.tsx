"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarIcon, Repeat } from "lucide-react";
import { format, parseISO } from "date-fns";
import useSWR from "swr";
import { mutate } from "swr";
import { invalidateNext12CalendarMonths } from "@/lib/swr-invalidate";
import { calendarMonthSwrKey } from "@/lib/swr-keys";
import { createClient } from "@/lib/supabase/client";
import {
  fetchTransaction,
  fetchRecurringRule,
  fetchCategories,
  fetchNextChainSegment,
} from "@/lib/api";
import { GlassCategorySelectTrigger } from "@/components/glass-category-select-trigger";
import {
  createTransaction,
  createRecurringRule,
  updateTransaction,
  applyRecurringEditFromDate,
  endRecurringRuleFuture,
  moveRecurringOccurrence,
} from "@/lib/transactions-mutations";
import { ErrorBanner } from "@/components/error-banner";
import { GlassExpenseIncomeToggle } from "@/components/glass-expense-income-toggle";
import { GlassIconButton } from "@/components/glass-icon-button";
import { InlineError } from "@/components/inline-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function AddTransactionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editParam = searchParams.get("edit");
  const editRuleId = editParam?.startsWith("rule:") ? editParam.slice(5) : null;
  const editTxId = editParam && !editRuleId ? editParam : null;
  const isEditMode = !!editTxId || !!editRuleId;

  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const NO_CATEGORY_VALUE = "__none__";
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState<Date | undefined>(() =>
    getInitialDate(searchParams),
  );
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<string>("monthly");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editLoadError, setEditLoadError] = useState<string | null>(null);
  const [editRetryKey, setEditRetryKey] = useState(0);
  const [editLoading, setEditLoading] = useState(!!isEditMode);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [nextSegmentDate, setNextSegmentDate] = useState<string | null>(null);
  const [nextSegmentLoading, setNextSegmentLoading] = useState(false);
  const [recurringEditOccurrenceDate, setRecurringEditOccurrenceDate] =
    useState<string | null>(null);
  const [pendingRecurringEdit, setPendingRecurringEdit] = useState<{
    label: string;
    amount: number;
    frequency: "weekly" | "biweekly" | "monthly" | "yearly";
    category_id: string | null;
    occurrenceDate: string;
    newStartDate: string;
  } | null>(null);

  const { data: categories = [] } = useSWR("categories", fetchCategories);
  const sortedCategories = useSortedCategories(categories, type);

  useEffect(() => {
    async function loadAccount() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error: fetchError } = await supabase
        .from("accounts")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (fetchError) {
        setError(USER_FACING_ERROR);
        return;
      }
      if (data?.id) setAccountId(data.id);
    }
    loadAccount();
  }, []);

  useEffect(() => {
    if (!editTxId && !editRuleId) {
      setNextSegmentDate(null);
      setNextSegmentLoading(false);
      setRecurringEditOccurrenceDate(null);
      setEditLoadError(null);
      setEditRetryKey(0);
      setEditLoading(false);
      return;
    }
    if (editTxId) {
      setNextSegmentDate(null);
      setNextSegmentLoading(false);
      setRecurringEditOccurrenceDate(null);
      setEditLoadError(null);
      fetchTransaction(editTxId)
        .then((tx) => {
          if (!tx) {
            setEditLoadError("Couldn't find this transaction.");
            return;
          }
          setLabel(tx.label);
          setAmount(Math.abs(Number(tx.amount)).toFixed(2));
          setType(Number(tx.amount) >= 0 ? "income" : "expense");
          setCategoryId(tx.category_id ?? null);
          setDate(parseISO(tx.date));
        })
        .catch(() => setEditLoadError(USER_FACING_ERROR))
        .finally(() => setEditLoading(false));
      return;
    }
    if (editRuleId) {
      setNextSegmentDate(null);
      setNextSegmentLoading(false);
      setRecurringEditOccurrenceDate(null);
      setEditLoadError(null);
      fetchRecurringRule(editRuleId)
        .then((rule) => {
          if (!rule) {
            setEditLoadError("Couldn't find this recurring rule.");
            return;
          }
          setLabel(rule.label);
          setAmount(Math.abs(rule.amount).toFixed(2));
          setType(rule.amount >= 0 ? "income" : "expense");
          setCategoryId(rule.category_id ?? null);
          const dateFromParams = searchParams.get("date");
          const occDate =
            dateFromParams && dateFromParams.length >= 10
              ? dateFromParams.slice(0, 10)
              : String(rule.start_date).slice(0, 10);
          setRecurringEditOccurrenceDate(occDate);
          setNextSegmentLoading(true);
          void fetchNextChainSegment(editRuleId, occDate)
            .then(setNextSegmentDate)
            .catch(() => setNextSegmentDate(null))
            .finally(() => setNextSegmentLoading(false));
          setDate(
            dateFromParams
              ? parseISO(dateFromParams)
              : parseISO(rule.start_date),
          );
          setRecurring(true);
          setFrequency(rule.frequency);
        })
        .catch(() => setEditLoadError(USER_FACING_ERROR))
        .finally(() => setEditLoading(false));
    }
  }, [editTxId, editRuleId, searchParams.get("date"), editRetryKey]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!accountId || !date) return;
    const finalAmount =
      type === "expense"
        ? -Math.abs(parseFloat(amount))
        : Math.abs(parseFloat(amount));
    const dateStr = format(date, "yyyy-MM-dd");

    if (isEditMode && editTxId) {
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
      mutate(calendarMonthSwrKey(currentMonth, currentYear));
      mutate("transactions");
      router.back();
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
      setPendingRecurringEdit({
        label: label.trim(),
        amount: finalAmount,
        frequency: frequency as "weekly" | "biweekly" | "monthly" | "yearly",
        category_id: categoryId,
        occurrenceDate,
        newStartDate: dateStr,
      });
      setScopeDialogOpen(true);
      return;
    }

    if (recurring) {
      const { error: insertError } = await createRecurringRule({
        accountId,
        label: label.trim(),
        amount: finalAmount,
        frequency: frequency as "weekly" | "biweekly" | "monthly" | "yearly",
        startDate: dateStr,
        category_id: categoryId,
      });
      if (insertError) {
        setError(USER_FACING_ERROR);
        return;
      }
      invalidateNext12CalendarMonths();
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
      mutate(calendarMonthSwrKey(currentMonth, currentYear));
      mutate("transactions");
    }
    router.back();
  }

  async function handleDeleteAllFuture() {
    if (!editRuleId) return;
    setError(null);
    const occurrenceAnchor =
      recurringEditOccurrenceDate ??
      (date ? format(date, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"));
    const { error: endError } = await endRecurringRuleFuture(
      editRuleId,
      occurrenceAnchor,
    );
    if (endError) {
      setError(USER_FACING_ERROR);
      return;
    }
    invalidateNext12CalendarMonths();
    router.back();
  }

  async function confirmRecurringEditScope(scope: "once" | "fromDate") {
    if (!editRuleId || !pendingRecurringEdit) return;
    setError(null);
    const p = pendingRecurringEdit;
    if (scope === "once") {
      const { error: moveError } = await moveRecurringOccurrence({
        ruleId: editRuleId,
        originalOccurrenceDate: p.occurrenceDate,
        targetDate: p.newStartDate ?? p.occurrenceDate,
        accountId: accountId ?? "",
        label: p.label,
        amount: p.amount,
        category_id: p.category_id,
      });
      if (moveError) {
        setError(USER_FACING_ERROR);
        return;
      }
    } else {
      const { error: updateError } = await applyRecurringEditFromDate(
        editRuleId,
        p.occurrenceDate,
        {
          label: p.label,
          amount: p.amount,
          frequency: p.frequency,
          category_id: p.category_id,
          newStartDate: p.newStartDate,
        },
      );
      if (updateError) {
        setError(USER_FACING_ERROR);
        return;
      }
    }
    setScopeDialogOpen(false);
    setPendingRecurringEdit(null);
    invalidateNext12CalendarMonths();
    router.back();
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
        open={scopeDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setScopeDialogOpen(false);
            setPendingRecurringEdit(null);
          }
        }}
        onSelectScope={confirmRecurringEditScope}
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
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
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
                  onSelect={setDate}
                  initialFocus
                  disabled={
                    nextSegmentLoading
                      ? () => true
                      : editRuleId
                        ? (d) => {
                            const ds = format(d, "yyyy-MM-dd");
                            const tooEarly =
                              recurringEditOccurrenceDate != null &&
                              ds < recurringEditOccurrenceDate;
                            const tooLate = nextSegmentDate
                              ? ds >= nextSegmentDate
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
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-medium text-white/70">
                  Frequency
                </Label>
                <Select value={frequency} onValueChange={setFrequency}>
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
            )}
          </div>
        </div>

        <div className="page-enter-3 flex flex-col gap-2">
          {editLoadError && (
            <ErrorBanner
              variant="inline"
              message={editLoadError}
              onRetry={() => {
                setEditLoadError(null);
                setEditLoading(true);
                setEditRetryKey((k) => k + 1);
              }}
            />
          )}
          {error && <InlineError>{error}</InlineError>}

          {/* Submit */}
          <Button
            type="submit"
            disabled={!accountId || editLoading}
            className={submitButtonClass}
          >
            {editLoading
              ? "Loading…"
              : isEditMode
                ? type === "income"
                  ? "Update Income"
                  : "Update Expense"
                : type === "income"
                  ? "Add Income"
                  : "Add Expense"}
          </Button>
          {editRuleId && (
            <Button
              type="button"
              variant="destructive"
              className="mt-2 h-12 active:bg-destructive/80"
              onClick={handleDeleteAllFuture}
            >
              Delete this and all future occurrences
            </Button>
          )}
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
