"use client";

import { cn } from "@/lib/utils";

type GlassExpenseIncomeToggleProps = {
  value: "expense" | "income";
  onChange: (value: "expense" | "income") => void;
  className?: string;
  variant?: "glass" | "settings";
};

export function GlassExpenseIncomeToggle({
  value,
  onChange,
  className,
  variant = "glass",
}: GlassExpenseIncomeToggleProps) {
  const isGlass = variant === "glass";

  return (
    <div
      className={cn(
        "relative flex gap-2 rounded-2xl p-1",
        isGlass ? "bg-white/10" : "bg-muted",
        className,
      )}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1 bottom-1 left-1 z-0 w-[calc((100%-1rem)/2)] rounded-xl transition-transform duration-200",
          isGlass ? "bg-white/25" : "bg-primary",
          value === "income" && "translate-x-[calc(100%+0.5rem)]",
        )}
      />
      <button
        type="button"
        onClick={() => onChange("expense")}
        className={cn(
          "relative z-10 flex flex-1 items-center justify-center rounded-xl py-2.5 text-sm font-medium transition-colors duration-200",
          value === "expense"
            ? isGlass
              ? "text-white"
              : "text-primary-foreground"
            : isGlass
              ? "text-white/50 active:bg-white/15"
              : "text-muted-foreground active:bg-white/15",
        )}
      >
        Expense
      </button>
      <button
        type="button"
        onClick={() => onChange("income")}
        className={cn(
          "relative z-10 flex flex-1 items-center justify-center rounded-xl py-2.5 text-sm font-medium transition-colors duration-200",
          value === "income"
            ? isGlass
              ? "text-white"
              : "text-primary-foreground"
            : isGlass
              ? "text-white/50 active:bg-white/15"
              : "text-muted-foreground active:bg-white/15",
        )}
      >
        Income
      </button>
    </div>
  );
}
