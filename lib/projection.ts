import {
  addDays,
  addWeeks,
  addMonths,
  addYears,
  format,
  isBefore,
  isAfter,
  startOfMonth,
  endOfMonth,
} from "date-fns";

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  label: string;
}

export interface RecurringRule {
  id: string;
  start_date: string;
  end_date?: string | null;
  amount: number;
  label: string;
  frequency: "weekly" | "biweekly" | "monthly" | "yearly";
}

export function getProjectedBalances(
  startingBalance: number,
  transactions: Transaction[],
  recurringRules: RecurringRule[],
  month: number,
  year: number,
): Record<string, number> {
  const monthStart = startOfMonth(new Date(year, month));
  const monthEnd = endOfMonth(new Date(year, month));

  // Build a map of date -> total delta for the month
  const deltas: Record<string, number> = {};

  // Add one-time transactions
  for (const t of transactions) {
    const d = t.date.slice(0, 10);
    deltas[d] = (deltas[d] ?? 0) + t.amount;
  }

  // Expand recurring rules into individual days
  for (const rule of recurringRules) {
    let cursor = new Date(rule.start_date);
    const end = rule.end_date ? new Date(rule.end_date) : addYears(monthEnd, 1);
    while (!isAfter(cursor, monthEnd) && !isAfter(cursor, end)) {
      if (!isBefore(cursor, monthStart)) {
        const d = format(cursor, "yyyy-MM-dd");
        deltas[d] = (deltas[d] ?? 0) + rule.amount;
      }
      if (rule.frequency === "weekly") cursor = addWeeks(cursor, 1);
      else if (rule.frequency === "biweekly") cursor = addWeeks(cursor, 2);
      else if (rule.frequency === "monthly") cursor = addMonths(cursor, 1);
      else if (rule.frequency === "yearly") cursor = addYears(cursor, 1);
      else break;
    }
  }

  // Walk forward from startingBalance and accumulate
  const balances: Record<string, number> = {};
  let running = startingBalance;
  let cursor = new Date(monthStart);
  while (!isAfter(cursor, monthEnd)) {
    const d = format(cursor, "yyyy-MM-dd");
    running += deltas[d] ?? 0;
    balances[d] = running;
    cursor = addDays(cursor, 1);
  }

  return balances;
}
