"use client";

import { useState, useTransition } from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { AmountText } from "@/components/amount-text";
import { InlineError } from "@/components/inline-error";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { makeTransactionRecurring } from "@/lib/transactions-mutations";
import { USER_FACING_ERROR } from "@/lib/errors";
import type { Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MakeRecurringDialog({
  transaction,
  accountId,
  onClose,
  onSuccess,
}: {
  transaction: Transaction;
  accountId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [frequency, setFrequency] = useState<
    "weekly" | "biweekly" | "monthly" | "yearly"
  >("monthly");
  const [endCondition, setEndCondition] = useState<"none" | "date" | "count">(
    "none",
  );
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [endDatePickerOpen, setEndDatePickerOpen] = useState(false);
  const [count, setCount] = useState("12");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId) return;
    setDialogError(null);
    startTransition(async () => {
      try {
        const { error } = await makeTransactionRecurring(transaction.id, {
          accountId,
          label: transaction.label,
          amount: transaction.amount,
          startDate: transaction.date,
          category_id: transaction.category_id,
          frequency,
          endDate:
            endCondition === "date" && endDate
              ? format(endDate, "yyyy-MM-dd")
              : null,
          recurrenceCount:
            endCondition === "count" && count ? parseInt(count, 10) : null,
        });
        if (error) {
          setDialogError(USER_FACING_ERROR);
          return;
        }
        onSuccess();
      } catch {
        setDialogError(USER_FACING_ERROR);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm rounded-2xl border-white/20 bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle>Make Recurring</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
          <div className="rounded-xl border border-border bg-muted px-4 py-3">
            <p className="text-sm font-medium">{transaction.label}</p>
            <AmountText
              amount={transaction.amount}
              variant="list"
              className="mt-0.5"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-muted-foreground">
              Frequency
            </Label>
            <Select
              value={frequency}
              onValueChange={(v) =>
                setFrequency(v as "weekly" | "biweekly" | "monthly" | "yearly")
              }
            >
              <SelectTrigger className="h-11 rounded-xl">
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
            <Label className="text-sm font-medium text-muted-foreground">
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
                      ? "border-primary bg-primary/20 text-foreground"
                      : "border-border bg-muted text-muted-foreground hover:text-foreground",
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
                    variant="outline"
                    className="h-11 w-full justify-start font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                    {endDate ? format(endDate, "MMM d, yyyy") : "Pick end date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    defaultMonth={endDate ?? parseISO(transaction.date)}
                    onSelect={(d) => {
                      if (d) {
                        setEndDate(d);
                        setEndDatePickerOpen(false);
                      }
                    }}
                    disabled={(d) =>
                      format(d, "yyyy-MM-dd") <= transaction.date
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            )}

            {endCondition === "count" && (
              <Input
                type="number"
                min="1"
                max="9999"
                placeholder="e.g. 12"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="h-11 rounded-xl border-border bg-background text-foreground placeholder:text-muted-foreground"
              />
            )}
          </div>

          {dialogError && <InlineError>{dialogError}</InlineError>}

          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="h-11 flex-1 bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
              disabled={
                !accountId ||
                isPending ||
                (endCondition === "date" && !endDate)
              }
            >
              {isPending ? "Saving…" : "Make Recurring"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
