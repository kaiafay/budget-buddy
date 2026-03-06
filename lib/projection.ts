import type { Transaction, RecurringRule } from "@/lib/types";
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

function addFrequency(
  date: Date,
  frequency: RecurringRule["frequency"],
): Date {
  if (frequency === "weekly") return addWeeks(date, 1);
  if (frequency === "biweekly") return addWeeks(date, 2);
  if (frequency === "monthly") return addMonths(date, 1);
  if (frequency === "yearly") return addYears(date, 1);
  return date;
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
      cursor = addFrequency(cursor, rule.frequency);
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

export function sumRecurringBeforeDate(
  rules: RecurringRule[],
  firstDayOfMonth: string,
): number {
  const monthStart = new Date(firstDayOfMonth);
  let sum = 0;
  for (const rule of rules) {
    let cursor = new Date(rule.start_date);
    const end = rule.end_date
      ? new Date(rule.end_date)
      : addYears(new Date(), 10);
    while (isBefore(cursor, monthStart) && !isAfter(cursor, end)) {
      sum += rule.amount;
      cursor = addFrequency(cursor, rule.frequency);
    }
  }
  return sum;
}

export function expandRecurringForDateRange(
  rules: RecurringRule[],
  startDate: string,
  endDate: string,
): { id: string; label: string; amount: number; date: string; recurring: true }[] {
  const result: { id: string; label: string; amount: number; date: string; recurring: true }[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (const rule of rules) {
    let cursor = new Date(rule.start_date);
    const ruleEnd = rule.end_date ? new Date(rule.end_date) : addYears(end, 1);
    while (!isAfter(cursor, end) && !isAfter(cursor, ruleEnd)) {
      const d = format(cursor, "yyyy-MM-dd");
      if (d >= startDate && d <= endDate) {
        result.push({
          id: `${rule.id}-${d}`,
          label: rule.label,
          amount: rule.amount,
          date: d,
          recurring: true,
        });
      }
      cursor = addFrequency(cursor, rule.frequency);
    }
  }
  return result;
}
