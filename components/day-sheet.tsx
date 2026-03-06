"use client";

import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Plus } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/category-icon";
import { cn } from "@/lib/utils";

export interface DaySheetTransaction {
  id: string;
  label: string;
  amount: number;
  type: "income" | "expense";
  date: string;
  category: string;
}

interface DaySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string | null;
  transactions: DaySheetTransaction[];
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

  const dayTotal = transactions.reduce((sum, t) => {
    return sum + (t.type === "income" ? t.amount : -t.amount);
  }, 0);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="px-5 pt-5">
          <DrawerTitle className="text-lg">{formattedDate}</DrawerTitle>
          <DrawerDescription>
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
                  <CategoryIcon category={t.category} />
                  <div className="flex flex-1 flex-col">
                    <span className="text-sm font-medium text-foreground">
                      {t.label}
                    </span>
                    <span className="text-xs capitalize text-muted-foreground">
                      {t.category}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      t.type === "income" ? "text-[#22C55E]" : "text-[#EF4444]",
                    )}
                  >
                    {t.type === "income" ? "+" : "-"}$
                    {t.amount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              ))}

              {transactions.length > 1 && (
                <div className="mt-1 flex items-center justify-between border-t border-border px-3 pt-3">
                  <span className="text-sm font-medium text-muted-foreground">
                    Net total
                  </span>
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      dayTotal >= 0 ? "text-[#22C55E]" : "text-[#EF4444]",
                    )}
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
            className="h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
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
