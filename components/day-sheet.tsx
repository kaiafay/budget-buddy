"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import useSWR from "swr";
import {
  Plus,
  DollarSign,
  ArrowDownLeft,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
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
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { RecurringEditScopeDialog } from "@/components/recurring-edit-scope-dialog";
import { CategoryIcon, getCategoryColor } from "@/components/category-icons";
import { fetchCategories, fetchNextChainSegment } from "@/lib/api";
import {
  deleteTransaction,
  skipRecurringOccurrence,
  endRecurringRuleFuture,
  updateTransaction,
  applyRecurringEditFromDate,
  moveRecurringOccurrence,
} from "@/lib/transactions-mutations";
import type { Transaction, RecurringRule } from "@/lib/types";
import { useSortedCategories } from "@/hooks/use-sorted-categories";
import { cn } from "@/lib/utils";

function getRecurringRuleIdAndDate(id: string): {
  ruleId: string;
  date: string;
} {
  const date = id.slice(-10);
  const ruleId = id.slice(0, -11);
  return { ruleId, date };
}

export interface DayTransactionsContentProps {
  date: string;
  transactions: Transaction[];
  recurringRules: RecurringRule[];
  onMutate: (opts?: { recurringTouch?: boolean }) => void;
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
  const NO_CATEGORY_VALUE = "__none__";
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [nextSegmentDate, setNextSegmentDate] = useState<string | null>(null);
  const [nextSegmentLoading, setNextSegmentLoading] = useState(false);
  const [editOccurrenceDate, setEditOccurrenceDate] = useState<string | null>(
    null,
  );
  const [pendingEditPayload, setPendingEditPayload] = useState<{
    label: string;
    amount: number;
    frequency: "weekly" | "biweekly" | "monthly" | "yearly";
    category_id: string | null;
    newStartDate: string;
    ruleId: string;
    occurrenceDate: string;
  } | null>(null);

  const { data: categories = [] } = useSWR("categories", fetchCategories);
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
    setNextSegmentDate(null);
    if (t.recurring) {
      const { ruleId, date: occDate } = getRecurringRuleIdAndDate(t.id);
      setEditOccurrenceDate(occDate);
      setNextSegmentLoading(true);
      void fetchNextChainSegment(ruleId, occDate)
        .then(setNextSegmentDate)
        .finally(() => setNextSegmentLoading(false));
      const rule = recurringRules.find((r) => r.id === ruleId);
      setEditFrequency(rule?.frequency ?? "monthly");
    } else {
      setEditOccurrenceDate(null);
      setNextSegmentLoading(false);
    }
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelectedTransaction(null);
    setDrawerMode("actions");
    setScopeDialogOpen(false);
    setPendingEditPayload(null);
    setNextSegmentDate(null);
    setNextSegmentLoading(false);
    setEditOccurrenceDate(null);
  }

  async function handleSkipOccurrence() {
    if (!selectedTransaction?.recurring) return;
    const { ruleId, date: occurrenceDate } = getRecurringRuleIdAndDate(
      selectedTransaction.id,
    );
    const { error } = await skipRecurringOccurrence(ruleId, occurrenceDate);
    if (error) {
      setEditError(error.message);
      return;
    }
    onMutate({ recurringTouch: true });
    closeDrawer();
  }

  async function handleDeleteAllFuture() {
    if (!selectedTransaction?.recurring) return;
    const { ruleId, date: occurrenceDate } = getRecurringRuleIdAndDate(
      selectedTransaction.id,
    );
    const { error } = await endRecurringRuleFuture(ruleId, occurrenceDate);
    if (error) {
      setEditError(error.message);
      return;
    }
    onMutate({ recurringTouch: true });
    closeDrawer();
  }

  async function handleDeleteOneTime() {
    if (!selectedTransaction || selectedTransaction.recurring) return;
    const { error } = await deleteTransaction(selectedTransaction.id);
    if (error) {
      setEditError(error.message);
      return;
    }
    onMutate();
    closeDrawer();
  }

  async function handleSaveEdit() {
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
      setPendingEditPayload({
        label: editLabel.trim(),
        amount: finalAmount,
        frequency: editFrequency,
        category_id: editCategoryId,
        newStartDate: dateStr,
        ruleId,
        occurrenceDate,
      });
      setScopeDialogOpen(true);
      return;
    }

    const { error } = await updateTransaction(selectedTransaction.id, {
      label: editLabel.trim(),
      amount: finalAmount,
      date: dateStr,
      category_id: editCategoryId,
    });
    if (error) {
      setEditError(error.message);
      return;
    }
    onMutate();
    closeDrawer();
  }

  async function confirmRecurringScope(scope: "once" | "fromDate") {
    if (!pendingEditPayload) return;
    setEditError(null);
    const p = pendingEditPayload;
    if (scope === "once") {
      const { error } = await moveRecurringOccurrence({
        ruleId: p.ruleId,
        originalOccurrenceDate: p.occurrenceDate,
        targetDate: p.newStartDate ?? p.occurrenceDate,
        accountId: accountId ?? "",
        label: p.label,
        amount: p.amount,
        category_id: p.category_id,
      });
      if (error) {
        setEditError(error.message);
        return;
      }
    } else {
      const { error } = await applyRecurringEditFromDate(
        p.ruleId,
        p.occurrenceDate,
        {
          label: p.label,
          amount: p.amount,
          frequency: p.frequency,
          category_id: p.category_id,
          newStartDate: p.newStartDate,
        },
      );
      if (error) {
        setEditError(error.message);
        return;
      }
    }
    setScopeDialogOpen(false);
    setPendingEditPayload(null);
    onMutate({ recurringTouch: true });
    closeDrawer();
  }

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
                  {category ? (
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-xl"
                      style={{ background: getCategoryColor(category.icon) }}
                    >
                      <CategoryIcon
                        iconName={category.icon}
                        className={
                          t.amount > 0
                            ? "h-4 w-4 text-white"
                            : "h-4 w-4 text-white/70"
                        }
                      />
                    </div>
                  ) : t.amount > 0 ? (
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
                </button>
              );
            })}

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
        className="mt-4 h-11 w-full border border-white/20 bg-primary text-white hover:bg-primary/90 active:bg-primary/80"
      >
        <Link href={`/add?date=${date}`}>
          <Plus className="mr-2 h-4 w-4" />
          Add transaction
        </Link>
      </Button>

      <RecurringEditScopeDialog
        open={scopeDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setScopeDialogOpen(false);
            setPendingEditPayload(null);
          }
        }}
        onSelectScope={confirmRecurringScope}
      />

      <Drawer open={drawerOpen} onOpenChange={(open) => !open && closeDrawer()}>
        <DrawerContent
          className="flex flex-col border-white/20 text-white pb-[env(safe-area-inset-bottom,0px)] min-h-0"
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
                  className="h-11 justify-start border-white/20 bg-white/10 text-white hover:bg-white/20 active:bg-white/15"
                  onClick={() => setDrawerMode("edit")}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                {selectedTransaction.recurring ? (
                  <>
                    <Button
                      variant="outline"
                      className="h-11 justify-start border-white/20 bg-white/10 text-white hover:bg-white/20 active:bg-white/15"
                      onClick={handleSkipOccurrence}
                    >
                      Delete this occurrence
                    </Button>
                    <Button
                      variant="destructive"
                      className="h-11 justify-start active:bg-destructive/80"
                      onClick={handleDeleteAllFuture}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete this and all future occurrences
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="destructive"
                    className="h-11 justify-start active:bg-destructive/80"
                    onClick={handleDeleteOneTime}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete transaction
                  </Button>
                )}
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
                <div className="flex gap-2 rounded-2xl bg-white/10 p-1">
                  <button
                    type="button"
                    onClick={() => setEditType("expense")}
                    className={cn(
                      "flex flex-1 items-center justify-center rounded-xl py-2.5 text-sm font-medium transition-all",
                      editType === "expense"
                        ? "bg-white/25 text-white"
                        : "text-white/50 active:bg-white/15",
                    )}
                  >
                    Expense
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditType("income")}
                    className={cn(
                      "flex flex-1 items-center justify-center rounded-xl py-2.5 text-sm font-medium transition-all",
                      editType === "income"
                        ? "bg-white/25 text-white"
                        : "text-white/50 active:bg-white/15",
                    )}
                  >
                    Income
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium text-white/70">
                    Amount
                  </Label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-white/70">
                      $
                    </span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="h-12 rounded-xl border-white/20 bg-white/10 pl-8 text-lg font-semibold tabular-nums text-white"
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
                    className="h-11 rounded-xl border-white/20 bg-white/10 text-white"
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium text-white/70">
                    Category
                  </Label>
                  <Select
                    value={editCategoryId ?? NO_CATEGORY_VALUE}
                    onValueChange={(v) =>
                      setEditCategoryId(v === NO_CATEGORY_VALUE ? null : v)
                    }
                  >
                    <SelectTrigger
                      data-no-category={editCategoryId == null}
                      className="h-11 w-full rounded-xl border-white/20 bg-white/10 text-white [&_[data-slot=select-value]_span]:text-white [&_[data-slot=select-value]_svg]:text-white/70 data-[no-category=true]:[&_[data-slot=select-value]_span]:text-white/40 [&>svg]:hidden"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="text-popover-foreground">
                      <SelectItem value={NO_CATEGORY_VALUE}>
                        <span className="text-muted-foreground">
                          No category
                        </span>
                      </SelectItem>
                      {sortedCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <span className="flex items-center gap-2 text-popover-foreground">
                            <CategoryIcon
                              iconName={cat.icon}
                              className="h-4 w-4 text-muted-foreground"
                            />
                            {cat.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedTransaction.recurring && (
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
                        onSelect={setEditDate}
                        disabled={
                          nextSegmentLoading
                            ? () => true
                            : selectedTransaction.recurring
                              ? (d) => {
                                  const ds = format(d, "yyyy-MM-dd");
                                  const tooEarly =
                                    editOccurrenceDate != null &&
                                    ds < editOccurrenceDate;
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
                {editError && <InlineError>{editError}</InlineError>}
                <DrawerFooter className="flex flex-col gap-2 px-0 pb-0 pt-2">
                  <Button
                    type="submit"
                    className="h-11 border border-white/20 bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80"
                  >
                    Save changes
                  </Button>
                  {selectedTransaction.recurring && (
                    <Button
                      type="button"
                      variant="destructive"
                      className="h-11 active:bg-destructive/80"
                      onClick={handleDeleteAllFuture}
                    >
                      Delete this and all future occurrences
                    </Button>
                  )}
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
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white active:bg-white/15"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </DrawerClose>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
