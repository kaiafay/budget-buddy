import type {
  RecurringException,
  RecurringRule,
  Transaction,
} from "@/lib/types";
import {
  addDays,
  addWeeks,
  addMonths,
  addYears,
  format,
  isBefore,
  isAfter,
  parseISO,
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

function getExceptionByRuleAndDate(
  exceptions: RecurringException[] | undefined,
  ruleId: string,
  dateStr: string,
): RecurringException | undefined {
  if (!exceptions?.length) return undefined;
  return exceptions.find(
    (e) => e.rule_id === ruleId && e.exception_date === dateStr,
  );
}

export function getProjectedBalances(
  startingBalance: number,
  transactions: Transaction[],
  recurringRules: RecurringRule[],
  month: number,
  year: number,
  exceptions?: RecurringException[],
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

  // Expand recurring rules into individual days (respecting exceptions)
  for (const rule of recurringRules) {
    let cursor = parseISO(rule.start_date);
    const end = rule.end_date ? parseISO(rule.end_date) : addYears(monthEnd, 1);
    while (!isAfter(cursor, monthEnd) && !isAfter(cursor, end)) {
      if (!isBefore(cursor, monthStart)) {
        const d = format(cursor, "yyyy-MM-dd");
        const ex = getExceptionByRuleAndDate(exceptions, rule.id, d);
        if (ex?.type === "skip") {
          cursor = addFrequency(cursor, rule.frequency);
          continue;
        }
        const amount =
          ex?.type === "modified" && ex.modified_amount != null
            ? Number(ex.modified_amount)
            : rule.amount;
        deltas[d] = (deltas[d] ?? 0) + amount;
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
  exceptions?: RecurringException[],
): number {
  const monthStart = parseISO(firstDayOfMonth);
  let sum = 0;
  for (const rule of rules) {
    let cursor = parseISO(rule.start_date);
    const end = rule.end_date
      ? parseISO(rule.end_date)
      : addYears(new Date(), 10);
    while (isBefore(cursor, monthStart) && !isAfter(cursor, end)) {
      const d = format(cursor, "yyyy-MM-dd");
      const ex = getExceptionByRuleAndDate(exceptions, rule.id, d);
      if (ex?.type !== "skip") {
        const amount =
          ex?.type === "modified" && ex.modified_amount != null
            ? Number(ex.modified_amount)
            : rule.amount;
        sum += amount;
      }
      cursor = addFrequency(cursor, rule.frequency);
    }
  }
  return sum;
}

export function expandRecurringForDateRange(
  rules: RecurringRule[],
  startDate: string,
  endDate: string,
  exceptions?: RecurringException[],
): { id: string; label: string; amount: number; date: string; recurring: true; category_id: string | null }[] {
  const result: { id: string; label: string; amount: number; date: string; recurring: true; category_id: string | null }[] = [];
  const end = parseISO(endDate);
  for (const rule of rules) {
    let cursor = parseISO(rule.start_date);
    const ruleEnd = rule.end_date ? parseISO(rule.end_date) : addYears(end, 1);
    while (!isAfter(cursor, end) && !isAfter(cursor, ruleEnd)) {
      const d = format(cursor, "yyyy-MM-dd");
      if (d >= startDate && d <= endDate) {
        const ex = getExceptionByRuleAndDate(exceptions, rule.id, d);
        if (ex?.type === "skip") {
          cursor = addFrequency(cursor, rule.frequency);
          continue;
        }
        const amount =
          ex?.type === "modified" && ex.modified_amount != null
            ? Number(ex.modified_amount)
            : rule.amount;
        const label =
          ex?.type === "modified" && ex.modified_label != null
            ? ex.modified_label
            : rule.label;
        result.push({
          id: `${rule.id}-${d}`,
          label,
          amount,
          date: d,
          recurring: true,
          category_id: rule.category_id ?? null,
        });
      }
      cursor = addFrequency(cursor, rule.frequency);
    }
  }
  return result;
}

/**
 * Returns transactions for a single date from month data (one-time + expanded recurring).
 */
export function getTransactionsForDate(
  monthTransactions: { id: string; label: string; amount: number; date: string; category_id?: string | null }[],
  recurringRules: RecurringRule[],
  firstDayOfMonth: string,
  lastDayOfMonth: string,
  date: string,
  exceptions?: RecurringException[],
): Transaction[] {
  const monthTx = monthTransactions.map((t) => ({
    id: t.id,
    label: t.label,
    amount: t.amount,
    date: t.date,
    recurring: false as const,
    category_id: t.category_id ?? null,
  }));
  const expanded = expandRecurringForDateRange(
    recurringRules,
    firstDayOfMonth,
    lastDayOfMonth,
    exceptions,
  );
  const combined = [...monthTx, ...expanded].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  return combined
    .filter((t) => t.date === date)
    .map((t) => ({
      id: t.id,
      label: t.label,
      amount: t.amount,
      date: t.date,
      recurring: t.recurring ?? false,
      category_id: t.category_id ?? null,
    }));
}
