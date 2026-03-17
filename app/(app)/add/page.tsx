"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarIcon, Repeat } from "lucide-react";
import { format, parseISO } from "date-fns";
import { mutate } from "swr";
import { createClient } from "@/lib/supabase/client";
import { fetchTransaction, fetchRecurringRule } from "@/lib/api";
import {
  createTransaction,
  createRecurringRule,
  updateTransaction,
  updateRecurringRuleFromDate,
  endRecurringRuleFuture,
} from "@/lib/transactions-mutations";
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
  const [date, setDate] = useState<Date | undefined>(() =>
    getInitialDate(searchParams),
  );
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<string>("monthly");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [noAccount, setNoAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(!!isEditMode);

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
        setNoAccount(true);
        return;
      }
      if (data?.id) setAccountId(data.id);
      else setNoAccount(true);
    }
    loadAccount();
  }, []);

  useEffect(() => {
    if (!editTxId && !editRuleId) {
      setEditLoading(false);
      return;
    }
    if (editTxId) {
      fetchTransaction(editTxId)
        .then((tx) => {
          if (tx) {
            setLabel(tx.label);
            setAmount(Math.abs(Number(tx.amount)).toFixed(2));
            setType(Number(tx.amount) >= 0 ? "income" : "expense");
            setDate(parseISO(tx.date));
          }
        })
        .finally(() => setEditLoading(false));
      return;
    }
    if (editRuleId) {
      fetchRecurringRule(editRuleId)
        .then((rule) => {
          if (rule) {
            setLabel(rule.label);
            setAmount(Math.abs(rule.amount).toFixed(2));
            setType(rule.amount >= 0 ? "income" : "expense");
            const occurrenceDate = searchParams.get("date");
            setDate(
              occurrenceDate
                ? parseISO(occurrenceDate)
                : parseISO(rule.start_date),
            );
            setRecurring(true);
            setFrequency(rule.frequency);
          }
        })
        .finally(() => setEditLoading(false));
    }
  }, [editTxId, editRuleId]);

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
      });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      const currentMonth = date.getMonth() + 1;
      const currentYear = date.getFullYear();
      mutate(`calendar-month-${currentMonth}-${currentYear}`);
      mutate("transactions");
      router.back();
      return;
    }

    if (isEditMode && editRuleId) {
      const occurrenceDate = date
        ? format(date, "yyyy-MM-dd")
        : format(new Date(), "yyyy-MM-dd");
      const { error: updateError } = await updateRecurringRuleFromDate(
        editRuleId,
        occurrenceDate,
        {
          label: label.trim(),
          amount: finalAmount,
          frequency: frequency as "weekly" | "biweekly" | "monthly" | "yearly",
        },
      );
      if (updateError) {
        setError(updateError.message);
        return;
      }
      const currentMonth = date.getMonth() + 1;
      const currentYear = date.getFullYear();
      mutate(`calendar-month-${currentMonth}-${currentYear}`);
      mutate("transactions");
      router.back();
      return;
    }

    if (recurring) {
      const { error: insertError } = await createRecurringRule({
        accountId,
        label: label.trim(),
        amount: finalAmount,
        frequency: frequency as "weekly" | "biweekly" | "monthly" | "yearly",
        startDate: dateStr,
      });
      if (insertError) {
        setError(insertError.message);
        return;
      }
    } else {
      const { error: insertError } = await createTransaction({
        accountId,
        label: label.trim(),
        amount: finalAmount,
        date: dateStr,
      });
      if (insertError) {
        setError(insertError.message);
        return;
      }
    }
    const currentMonth = date.getMonth() + 1;
    const currentYear = date.getFullYear();
    mutate(`calendar-month-${currentMonth}-${currentYear}`);
    mutate("transactions");
    router.back();
  }

  async function handleDeleteAllFuture() {
    if (!editRuleId) return;
    setError(null);
    const occurrenceDate = date
      ? format(date, "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd");
    const { error: endError } = await endRecurringRuleFuture(
      editRuleId,
      occurrenceDate,
    );
    if (endError) {
      setError(endError.message);
      return;
    }
    const currentMonth = date?.getMonth() ?? new Date().getMonth();
    const currentYear = date?.getFullYear() ?? new Date().getFullYear();
    mutate(`calendar-month-${currentMonth + 1}-${currentYear}`);
    mutate("transactions");
    router.back();
  }

  return (
    <div className="flex flex-col pb-6">
      {/* Header */}
      <header className="page-enter-1 flex items-center gap-3 px-5 pb-4 pt-6">
        <button
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-semibold text-white">
          {isEditMode ? "Edit Transaction" : "Add Transaction"}
        </h1>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-5 pb-8">
        <div className="page-enter-2 flex flex-col gap-5">
          {/* Type toggle */}
          <div className="flex gap-2 rounded-2xl bg-white/10 p-1">
            <button
              type="button"
              onClick={() => setType("expense")}
              className={cn(
                "flex flex-1 items-center justify-center rounded-xl py-2.5 text-sm font-medium transition-all",
                type === "expense" ? "bg-white/25 text-white" : "text-white/50",
              )}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => setType("income")}
              className={cn(
                "flex flex-1 items-center justify-center rounded-xl py-2.5 text-sm font-medium transition-all",
                type === "income" ? "bg-white/25 text-white" : "text-white/50",
              )}
            >
              Income
            </button>
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="amount"
              className="text-sm font-medium text-white/70"
            >
              Amount
            </Label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-white/70">
                $
              </span>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-12 rounded-xl border-white/20 bg-white/10 pl-8 text-lg font-semibold tabular-nums text-white placeholder:text-white/40"
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
              className="h-11 rounded-xl border-white/20 bg-white/10 text-white placeholder:text-white/40"
              required
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
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Recurring */}
          <div className="glass-card flex flex-col gap-4 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
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
          {noAccount && (
            <p className="text-sm text-destructive">
              Please set up your account in Settings first.
            </p>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={!accountId || editLoading}
            className="mt-2 h-12 border border-white/20 bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
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
              className="mt-2 h-12"
              onClick={handleDeleteAllFuture}
            >
              Delete all future occurrences
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
