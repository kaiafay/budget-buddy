import { useMemo } from "react";
import type { Category } from "@/lib/types";

export function useSortedCategories(
  categories: Category[],
  activeType: "expense" | "income",
): Category[] {
  return useMemo(() => {
    const expenseFirst = [...categories]
      .filter((c) => c.type === "expense")
      .sort((a, b) => a.name.localeCompare(b.name));
    const incomeFirst = [...categories]
      .filter((c) => c.type === "income")
      .sort((a, b) => a.name.localeCompare(b.name));
    return activeType === "expense"
      ? [...expenseFirst, ...incomeFirst]
      : [...incomeFirst, ...expenseFirst];
  }, [categories, activeType]);
}
