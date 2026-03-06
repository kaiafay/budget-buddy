"use client";

import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Plus, DollarSign, ArrowDownLeft } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import type { Transaction } from "@/lib/types";

interface DaySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string | null;
  transactions: Transaction[];
}

export function DaySheet({
  open,
  onOpenChange,
  date,
  transactions,
}: DaySheetProps) {
  const router = useRouter();
  const formattedDate = date
    ? format(parseISO(date), "EEEE, MMMM d, yyyy")
    : "";

  const dayTotal = transactions.reduce((sum, t) => sum + t.amount, 0);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="glass-card border-0">
        <DrawerHeader className="px-5 pt-5">
          <DrawerTitle className="text-lg text-white">{formattedDate}</DrawerTitle>
          <DrawerDescription className="text-white/70">
            {transactions.length === 0
              ? "No transactions on this day"
              : `${transactions.length} transaction${transactions.length > 1 ? "s" : ""}`}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-1 px-5 pb-4">
          {transactions.length > 0 && (
            <>
              {transactions.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                >
                  {t.amount > 0 ? (
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                      <DollarSign className="h-4 w-4 text-white" />
                    </div>
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                      <ArrowDownLeft className="h-4 w-4 text-white/70" />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col">
                    <span className="text-sm font-medium text-white">
                      {t.label}
                      {t.recurring && (
                        <span className="ml-1 text-xs text-white/70">
                          ↻
                        </span>
                      )}
                    </span>
                  </div>
                  <span
                    className={
                      t.amount >= 0
                        ? "text-sm font-semibold tabular-nums text-emerald-300"
                        : "text-sm font-semibold tabular-nums text-red-300"
                    }
                  >
                    {t.amount >= 0 ? "+" : "-"}$
                    {Math.abs(t.amount).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              ))}

              {transactions.length > 1 && (
                <div className="mt-1 flex items-center justify-between border-t border-white/20 px-3 pt-3">
                  <span className="text-sm font-medium text-white/70">
                    Net total
                  </span>
                  <span
                    className={
                      dayTotal >= 0
                        ? "text-sm font-semibold tabular-nums text-emerald-300"
                        : "text-sm font-semibold tabular-nums text-red-300"
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

        <DrawerFooter className="px-5 pb-6">
          <Button
            type="button"
            className="h-11 rounded-xl border border-white/20 bg-primary text-white hover:bg-primary/90"
            onClick={() => router.push(date ? `/add?date=${date}` : "/add")}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add transaction
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
