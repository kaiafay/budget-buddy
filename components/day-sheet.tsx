"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import useSWR from "swr";
import { CalendarIcon, Plus, Pencil, Repeat, Trash2, X } from "lucide-react";
import { AmountText } from "@/components/amount-text";
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
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { RecurringEditScopeDialog } from "@/components/recurring-edit-scope-dialog";
import { GlassCategorySelectTrigger } from "@/components/glass-category-select-trigger";
import { TransactionLeadingIcon } from "@/components/transaction-leading-icon";
import { categoriesSwrKey } from "@/lib/swr-keys";
import { fetchCategories, fetchNextChainSegment } from "@/lib/api";
import { getRecurringRuleIdAndDate } from "@/lib/recurring-rules";
import {
  glassAmountInputClass,
  glassCurrencyPrefixClass,
  glassInputClass,
} from "@/lib/glass-classes";
import {
  deleteTransaction,
  skipRecurringOccurrence,
  endRecurringRuleFuture,
  updateTransaction,
} from "@/lib/transactions-mutations";
import { MakeRecurringDialog } from "@/components/make-recurring-dialog";
import { USER_FACING_ERROR } from "@/lib/errors";
import type { Transaction, RecurringRule } from "@/lib/types";
import { useSortedCategories } from "@/hooks/use-sorted-categories";
import { useRecurringEditScope } from "@/hooks/use-recurring-edit-scope";
import { cn } from "@/lib/utils";

const NO_CATEGORY_VALUE = "__none__";

export interface DayTransactionsContentProps {
  date: string;
  transactions: Transaction[];
  recurringRules: RecurringRule[];
  onMutate: (opts?: {
    recurringTouch?: boolean;
    targetDate?: string;
  }) => void;
  accountId: string | null;
}

/**
 * Inline day transactions block: "Month Day" header, count, list, net total, Add button.
 * Used below the calendar (today when no selection, selected day when selected).
 * Tapping a transaction opens a drawer with Edit / Skip occurrence / Delete all future / Delete.
 */
export function DayTransactionsContent({
  date,
  transactions,
  recurringRules,
  onMutate,
  accountId,
}: DayTransactionsContentProps) {
  const monthDay = format(parseISO(date), "MMMM d");
  const dayTotal = transactions.reduce((sum, t) => sum + t.amount, 0);
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const [drawerMode, setDrawerMode] = useState<"actions" | "edit">("actions");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editLabel, setEditLabel] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editType, setEditType] = useState<"expense" | "income">("expense");
  const [editDate, setEditDate] = useState<Date | undefined>(undefined);
  const [editError, setEditError] = useState<string | null>(null);
  const [editFrequency, setEditFrequency] = useState<
    "weekly" | "biweekly" | "monthly" | "yearly"
  >("monthly");
  const [editEndCondition, setEditEndCondition] = useState<
    "none" | "date" | "count"
  >("none");
  const [editEndDate, setEditEndDate] = useState<Date | undefined>(undefined);
  const [editEndDatePickerOpen, setEditEndDatePickerOpen] = useState(false);
  const [editCount, setEditCount] = useState("12");
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [makeRecurringTxForDialog, setMakeRecurringTxForDialog] =
    useState<Transaction | null>(null);
  const [isPending, startTransition] = useTransition();
  const scope = useRecurringEditScope(accountId);

  const { data: categories = [] } = useSWR(
    accountId ? categoriesSwrKey(accountId) : null,
    () => fetchCategories(accountId!),
  );
  const sortedCategories = useSortedCategories(categories, editType);

  function openDrawer(t: Transaction) {
    setSelectedTransaction(t);
    setDrawerMode("actions");
    setEditError(null);
    setEditLabel(t.label);
    setEditAmount(Math.abs(t.amount).toFixed(2));
    setEditType(t.amount >= 0 ? "income" : "expense");
    setEditDate(parseISO(t.date));
    setEditCategoryId(t.category_id ?? null);
    scope.setNextSegmentDate(null);
    if (t.recurring) {
      const { ruleId, date: occDate } = getRecurringRuleIdAndDate(t.id);
      scope.setOccurrenceDate(occDate);
      scope.setNextSegmentLoading(true);
      void fetchNextChainSegment(ruleId, occDate)
        .then(scope.setNextSegmentDate)
        .catch(() => null)
        .finally(() => scope.setNextSegmentLoading(false));
      const rule = recurringRules.find((r) => r.id === ruleId);
      setEditFrequency(rule?.frequency ?? "monthly");
      if (rule?.end_date) {
        setEditEndCondition("date");
        setEditEndDate(parseISO(rule.end_date));
      } else {
        setEditEndCondition("none");
        setEditEndDate(undefined);
      }
    } else {
      scope.setOccurrenceDate(null);
      scope.setNextSegmentLoading(false);
    }
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerMode("actions");
    setDrawerOpen(false);
    setSelectedTransaction(null);
    setEditEndCondition("none");
    setEditEndDate(undefined);
    setEditEndDatePickerOpen(false);
    setEditCount("12");
    scope.reset();
  }

  function handleOpenMakeRecurring() {
    if (!selectedTransaction) return;
    const tx = selectedTransaction;
    setMakeRecurringTxForDialog(tx);
    setDrawerMode("actions");
    setDrawerOpen(false);
    setSelectedTransaction(null);
    setEditEndCondition("none");
    setEditEndDate(undefined);
    setEditEndDatePickerOpen(false);
    setEditCount("12");
    scope.reset();
  }

  function handleSkipOccurrence() {
    if (!selectedTransaction?.recurring) return;
    const { ruleId, date: occurrenceDate } = getRecurringRuleIdAndDate(
      selectedTransaction.id,
    );
    startTransition(async () => {
      try {
        const { error } = await skipRecurringOccurrence(ruleId, occurrenceDate);
        if (error) {
          setEditError(USER_FACING_ERROR);
          return;
        }
        onMutate({ recurringTouch: true });
        closeDrawer();
      } catch {
        setEditError(USER_FACING_ERROR);
      }
    });
  }

  function handleDeleteAllFuture() {
    if (!selectedTransaction?.recurring) return;
    const { ruleId, date: occurrenceDate } = getRecurringRuleIdAndDate(
      selectedTransaction.id,
    );
    startTransition(async () => {
      try {
        const { error } = await endRecurringRuleFuture(ruleId, occurrenceDate);
        if (error) {
          setEditError(USER_FACING_ERROR);
          return;
        }
        onMutate({ recurringTouch: true });
        closeDrawer();
      } catch {
        setEditError(USER_FACING_ERROR);
      }
    });
  }

  function handleDeleteOneTime() {
    if (!selectedTransaction || selectedTransaction.recurring) return;
    startTransition(async () => {
      try {
        const { error } = await deleteTransaction(selectedTransaction.id);
        if (error) {
          setEditError(USER_FACING_ERROR);
          return;
        }
        onMutate();
        closeDrawer();
      } catch {
        setEditError(USER_FACING_ERROR);
      }
    });
  }

  function handleSaveEdit() {
    if (!selectedTransaction) return;
    setEditError(null);
    const amountNum = parseFloat(editAmount);
    if (Number.isNaN(amountNum) || amountNum <= 0) {
      setEditError("Enter a valid amount");
      return;
    }
    const finalAmount = editType === "expense" ? -amountNum : amountNum;
    if (!editDate) {
      setEditError("Pick a date");
      return;
    }
    const dateStr = format(editDate, "yyyy-MM-dd");

    if (selectedTransaction.recurring) {
      const { ruleId, date: occurrenceDate } = getRecurringRuleIdAndDate(
        selectedTransaction.id,
      );
      scope.openScope({
        ruleId,
        label: editLabel.trim(),
        amount: finalAmount,
        frequency: editFrequency,
        category_id: editCategoryId,
        occurrenceDate,
        newStartDate: dateStr,
        endDate:
          editEndCondition === "date" && editEndDate
            ? format(editEndDate, "yyyy-MM-dd")
            : null,
        recurrenceCount:
          editEndCondition === "count" && editCount
            ? parseInt(editCount, 10)
            : null,
      });
      return;
    }

    startTransition(async () => {
      try {
        const { error } = await updateTransaction(selectedTransaction.id, {
          label: editLabel.trim(),
          amount: finalAmount,
          date: dateStr,
          category_id: editCategoryId,
        });
        if (error) {
          setEditError(USER_FACING_ERROR);
          return;
        }
        onMutate({ targetDate: dateStr });
        closeDrawer();
      } catch {
        setEditError(USER_FACING_ERROR);
      }
    });
  }

  function confirmRecurringScope(s: "once" | "fromDate") {
    setEditError(null);
    startTransition(async () => {
      try {
        const result = await scope.confirmScope(s);
        if (!result) {
          setEditError(USER_FACING_ERROR);
          return;
        }
        onMutate({ recurringTouch: true, targetDate: result.targetDate });
        closeDrawer();
      } catch {
        setEditError(USER_FACING_ERROR);
      }
    });
  }

  const drawerOutlineButtonClass =
    "h-11 justify-start border-white/20 bg-white/10 text-white hover:bg-white/20 active:bg-white/15";

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
            {transactions.map((t) => {
              const category = t.category_id
                ? categories.find((c) => c.id === t.category_id)
                : null;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => openDrawer(t)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/5 active:bg-white/10"
                >
                  <TransactionLeadingIcon
                    category={category}
                    amount={t.amount}
                    dimExpenseCategoryIcon
                  />
                  <div className="flex flex-1 flex-col">
                    <span className="text-overlay text-sm font-medium text-white">
                      {t.label}
                      {t.recurring && (
                        <Repeat className="ml-1 inline h-3 w-3 text-white/70" />
                      )}
                    </span>
                  </div>
                  <AmountText amount={t.amount} variant="list" />
                </button>
              );
            })}

            {transactions.length > 1 && (
              <div className="mt-1 flex items-center justify-between border-t border-white/20 px-3 pt-3">
                <span className="text-overlay text-sm font-medium text-white/70">
                  Net total
                </span>
                <AmountText amount={dayTotal} variant="list" />
              </div>
            )}
          </>
        )}
      </div>

      <Button
        asChild
        className="mt-4 h-11 w-full border border-white/20 bg-primary text-white hover:bg-primary/90 active:bg-primary/80"
      >
        <Link href={`/add?date=${date}`}>
          <Plus className="mr-2 h-4 w-4" />
          Add transaction
        </Link>
      </Button>

      {makeRecurringTxForDialog && (
        <MakeRecurringDialog
          transaction={makeRecurringTxForDialog}
          accountId={accountId}
          onClose={() => setMakeRecurringTxForDialog(null)}
          onSuccess={() => {
            setMakeRecurringTxForDialog(null);
            onMutate({ recurringTouch: true });
          }}
        />
      )}

      <RecurringEditScopeDialog
        open={scope.scopeDialogOpen}
        onOpenChange={(open) => !open && scope.cancelScope()}
        onSelectScope={confirmRecurringScope}
        isPending={isPending}
      />

      <Drawer
        open={drawerOpen}
        onOpenChange={(open) => !open && closeDrawer()}
        repositionInputs={false}
      >
        <DrawerContent
          className="flex flex-col border-white/20 text-white pb-[env(safe-area-inset-bottom,0px)] min-h-0 max-h-[85dvh]"
          style={{ background: "linear-gradient(135deg, #4f6bed, #5b5bd6)" }}
        >
          {drawerMode === "actions" && selectedTransaction && (
            <>
              <DrawerHeader>
                <DrawerTitle className="text-lg text-white">
                  {selectedTransaction.label}
                </DrawerTitle>
              </DrawerHeader>
              <div className="flex flex-col gap-2 px-4 pb-4">
                <Button
                  variant="outline"
                  className={drawerOutlineButtonClass}
                  disabled={isPending}
                  onClick={() => setDrawerMode("edit")}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                {selectedTransaction.recurring ? (
                  <>
                    <Button
                      variant="outline"
                      className={drawerOutlineButtonClass}
                      disabled={isPending}
                      onClick={handleSkipOccurrence}
                    >
                      Delete this occurrence
                    </Button>
                    <Button
                      variant="destructive"
                      className="h-11 justify-start active:bg-destructive/80"
                      disabled={isPending}
                      onClick={handleDeleteAllFuture}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete this and all future occurrences
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      className={drawerOutlineButtonClass}
                      disabled={isPending}
                      onClick={handleOpenMakeRecurring}
                    >
                      <Repeat className="mr-2 h-4 w-4" />
                      Make recurring
                    </Button>
                    <Button
                      variant="destructive"
                      className="h-11 justify-start active:bg-destructive/80"
                      disabled={isPending}
                      onClick={handleDeleteOneTime}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete transaction
                    </Button>
                  </>
                )}
                {editError && <InlineError>{editError}</InlineError>}
              </div>
            </>
          )}

          {drawerMode === "edit" && selectedTransaction && (
            <div className="overflow-y-auto flex-1 min-h-0">
              <DrawerHeader>
                <DrawerTitle className="text-lg text-white">
                  Edit transaction
                </DrawerTitle>
              </DrawerHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveEdit();
                }}
                className="flex flex-col gap-4 px-4 pb-4"
              >
                <GlassExpenseIncomeToggle
                  value={editType}
                  onChange={setEditType}
                />
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium text-white/70">
                    Amount
                  </Label>
                  <div className="relative">
                    <span className={glassCurrencyPrefixClass}>$</span>
                    <CurrencyInput
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className={glassAmountInputClass}
                      required
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium text-white/70">
                    Label
                  </Label>
                  <Input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className={glassInputClass}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium text-white/70">
                    Category
                  </Label>
                  <GlassCategorySelectTrigger
                    value={editCategoryId}
                    noCategoryValue={NO_CATEGORY_VALUE}
                    onValueChange={(v) =>
                      setEditCategoryId(v === NO_CATEGORY_VALUE ? null : v)
                    }
                    categories={sortedCategories}
                  />
                </div>
                {selectedTransaction.recurring && (
                  <>
                    <div className="flex flex-col gap-2">
                      <Label className="text-sm font-medium text-white/70">
                        Frequency
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {(
                          ["weekly", "biweekly", "monthly", "yearly"] as const
                        ).map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setEditFrequency(f)}
                            className={cn(
                              "rounded-xl border px-3 py-2 text-xs font-medium capitalize transition-all",
                              editFrequency === f
                                ? "border-white/40 bg-white/25 text-white"
                                : "border-white/20 bg-white/10 text-white/50 active:bg-white/15",
                            )}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label className="text-sm font-medium text-white/70">
                        End
                      </Label>
                      <div className="flex gap-2">
                        {(["none", "date", "count"] as const).map((cond) => (
                          <button
                            key={cond}
                            type="button"
                            onClick={() => setEditEndCondition(cond)}
                            className={cn(
                              "flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
                              editEndCondition === cond
                                ? "border-white/40 bg-white/25 text-white"
                                : "border-white/20 bg-white/10 text-white/50 active:bg-white/15",
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
                      {editEndCondition === "date" && (
                        <Popover
                          open={editEndDatePickerOpen}
                          onOpenChange={setEditEndDatePickerOpen}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-11 w-full justify-start border-white/20 bg-white/10 text-left font-normal text-white active:bg-white/15"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4 text-white/70" />
                              {editEndDate
                                ? format(editEndDate, "MMM d, yyyy")
                                : "Pick end date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={editEndDate}
                              defaultMonth={editEndDate ?? editDate}
                              onSelect={(d) => {
                                setEditEndDate(d);
                                setEditEndDatePickerOpen(false);
                              }}
                              disabled={
                                editDate
                                  ? (d) =>
                                      format(d, "yyyy-MM-dd") <=
                                      format(editDate, "yyyy-MM-dd")
                                  : undefined
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      )}
                      {editEndCondition === "count" && (
                        <Input
                          type="number"
                          min="1"
                          max="9999"
                          placeholder="e.g. 12"
                          value={editCount}
                          onChange={(e) => setEditCount(e.target.value)}
                          className={glassInputClass}
                        />
                      )}
                    </div>
                  </>
                )}
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium text-white/70">
                    Date
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 w-full justify-start border-white/20 bg-white/10 text-left font-normal text-white active:bg-white/15"
                      >
                        {editDate
                          ? format(editDate, "MMM d, yyyy")
                          : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={editDate}
                        defaultMonth={editDate}
                        onSelect={setEditDate}
                        disabled={
                          scope.nextSegmentLoading
                            ? () => true
                            : selectedTransaction.recurring
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
                {editError && <InlineError>{editError}</InlineError>}
                <DrawerFooter className="flex flex-col gap-2 px-0 pb-0 pt-2">
                  <Button
                    type="submit"
                    disabled={isPending}
                    className="h-11 border border-white/20 bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80"
                  >
                    Save changes
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 text-white/70 hover:bg-white/10 hover:text-white active:bg-white/15"
                    onClick={() => setDrawerMode("actions")}
                  >
                    Cancel
                  </Button>
                </DrawerFooter>
              </form>
            </div>
          )}
          <div className="absolute right-4 top-4">
            <DrawerClose asChild>
              <GlassIconButton aria-label="Close">
                <X className="h-5 w-5" />
              </GlassIconButton>
            </DrawerClose>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
