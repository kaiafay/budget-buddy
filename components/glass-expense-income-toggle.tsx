"use client";

import { cn } from "@/lib/utils";

type GlassExpenseIncomeToggleProps = {
  value: "expense" | "income";
  onChange: (value: "expense" | "income") => void;
  className?: string;
};

export function GlassExpenseIncomeToggle({
  value,
  onChange,
  className,
}: GlassExpenseIncomeToggleProps) {
  return (
    <div className={cn("flex gap-2 rounded-2xl bg-white/10 p-1", className)}>
      <button
        type="button"
        onClick={() => onChange("expense")}
        className={cn(
          "flex flex-1 items-center justify-center rounded-xl py-2.5 text-sm font-medium transition-all",
          value === "expense"
            ? "bg-white/25 text-white"
            : "text-white/50 active:bg-white/15",
        )}
      >
        Expense
      </button>
      <button
        type="button"
        onClick={() => onChange("income")}
        className={cn(
          "flex flex-1 items-center justify-center rounded-xl py-2.5 text-sm font-medium transition-all",
          value === "income"
            ? "bg-white/25 text-white"
            : "text-white/50 active:bg-white/15",
        )}
      >
        Income
      </button>
    </div>
  );
}
