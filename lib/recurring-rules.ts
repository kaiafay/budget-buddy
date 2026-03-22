import type { RecurringRule } from "@/lib/types";

export type RecurringRuleRowInput = {
  id: string;
  start_date: string;
  end_date?: string | null;
  amount: string | number;
  label: string;
  frequency: string;
  category_id?: string | null;
};

export function mapRecurringRuleRow(row: RecurringRuleRowInput): RecurringRule {
  return {
    id: row.id,
    start_date: row.start_date,
    end_date: row.end_date ?? null,
    amount: Number(row.amount),
    label: row.label,
    frequency: row.frequency as "weekly" | "biweekly" | "monthly" | "yearly",
    category_id: row.category_id ?? null,
  };
}
