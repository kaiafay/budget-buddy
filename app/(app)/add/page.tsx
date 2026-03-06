"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarIcon, Repeat } from "lucide-react";
import { format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/client";
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

function getInitialDate(searchParams: ReturnType<typeof useSearchParams>): Date {
  const dateParam = searchParams.get("date");
  if (!dateParam) return new Date();
  try {
    const d = parseISO(dateParam);
    return isNaN(d.getTime()) ? new Date() : d;
  } catch {
    return new Date();
  }
}

export default function AddTransactionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [date, setDate] = useState<Date | undefined>(() => getInitialDate(searchParams));
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<string>("monthly");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [noAccount, setNoAccount] = useState(false);

  useEffect(() => {
    async function loadAccount() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("accounts")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.id) setAccountId(data.id);
      else setNoAccount(true);
    }
    loadAccount();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId || !date) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const finalAmount =
      type === "expense"
        ? -Math.abs(parseFloat(amount))
        : Math.abs(parseFloat(amount));
    if (recurring) {
      await supabase.from("recurring_rules").insert({
        user_id: user.id,
        account_id: accountId,
        label,
        amount: finalAmount,
        frequency,
        start_date: format(date, "yyyy-MM-dd"),
      });
    } else {
      await supabase.from("transactions").insert({
        user_id: user.id,
        account_id: accountId,
        label,
        amount: finalAmount,
        date: format(date, "yyyy-MM-dd"),
      });
    }
    router.refresh();
    router.back();
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 pb-4 pt-6">
        <button
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-semibold text-foreground">
          Add Transaction
        </h1>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-5 pb-8">
        {/* Type toggle */}
        <div className="flex gap-2 rounded-2xl bg-secondary p-1">
          <button
            type="button"
            onClick={() => setType("expense")}
            className={cn(
              "flex flex-1 items-center justify-center rounded-xl py-2.5 text-sm font-medium transition-all",
              type === "expense"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            Expense
          </button>
          <button
            type="button"
            onClick={() => setType("income")}
            className={cn(
              "flex flex-1 items-center justify-center rounded-xl py-2.5 text-sm font-medium transition-all",
              type === "income"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            Income
          </button>
        </div>

        {/* Amount */}
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="amount"
            className="text-sm font-medium text-foreground"
          >
            Amount
          </Label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">
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
              className="h-12 rounded-xl border-border bg-card pl-8 text-lg font-semibold tabular-nums"
              required
            />
          </div>
        </div>

        {/* Label */}
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="label"
            className="text-sm font-medium text-foreground"
          >
            Label
          </Label>
          <Input
            id="label"
            type="text"
            placeholder="e.g. Grocery Store"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="h-11 rounded-xl border-border bg-card"
            required
          />
        </div>

        {/* Date */}
        <div className="flex flex-col gap-2">
          <Label className="text-sm font-medium text-foreground">Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-11 w-full justify-start rounded-xl border-border bg-card text-left font-normal",
                  !date && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
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
        <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
                <Repeat className="h-4 w-4 text-primary" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">
                  Recurring
                </span>
                <span className="text-xs text-muted-foreground">
                  Repeat this transaction
                </span>
              </div>
            </div>
            <Switch
              checked={recurring}
              onCheckedChange={setRecurring}
              aria-label="Toggle recurring"
            />
          </div>

          {recurring && (
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">
                Frequency
              </Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger className="h-11 rounded-xl border-border">
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

        {noAccount && (
          <p className="text-sm text-destructive">
            Please set up your account in Settings first.
          </p>
        )}

        {/* Submit */}
        <Button
          type="submit"
          disabled={!accountId}
          className="mt-2 h-12 rounded-xl bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {type === "income" ? "Add Income" : "Add Expense"}
        </Button>
      </form>
    </div>
  );
}
