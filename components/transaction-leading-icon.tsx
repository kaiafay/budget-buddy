import { ArrowDownLeft, DollarSign } from "lucide-react";
import { CategoryIcon, getCategoryColor } from "@/components/category-icons";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";

type TransactionLeadingIconProps = {
  category?: Category | null;
  amount: number;
  className?: string;
  dimExpenseCategoryIcon?: boolean;
};

export function TransactionLeadingIcon({
  category,
  amount,
  className,
  dimExpenseCategoryIcon = false,
}: TransactionLeadingIconProps) {
  if (category) {
    const iconClass = dimExpenseCategoryIcon
      ? amount > 0
        ? "h-4 w-4 text-white"
        : "h-4 w-4 text-white/70"
      : "h-4 w-4 text-white";
    return (
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl",
          className,
        )}
        style={{ background: getCategoryColor(category.icon) }}
      >
        <CategoryIcon iconName={category.icon} className={iconClass} />
      </div>
    );
  }

  if (amount > 0) {
    return (
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl bg-white/20",
          className,
        )}
      >
        <DollarSign className="h-4 w-4 text-white" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-xl bg-white/10",
        className,
      )}
    >
      <ArrowDownLeft className="h-4 w-4 text-white/70" />
    </div>
  );
}
