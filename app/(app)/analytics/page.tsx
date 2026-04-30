"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  eachWeekOfInterval,
  addDays,
  max as dateMax,
  min as dateMin,
} from "date-fns";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TooltipProps } from "recharts";
import { fetchTransactions, fetchCategories } from "@/lib/api";
import { expandRecurringForDateRange } from "@/lib/projection";
import { mapRecurringRuleRow } from "@/lib/recurring-rules";
import { categoriesSwrKey, transactionsSwrKey } from "@/lib/swr-keys";
import { cn } from "@/lib/utils";
import { ErrorBanner } from "@/components/error-banner";
import { useActiveAccount } from "@/components/active-account-provider";

type TimeRange = "current" | "last3";

const CHART_COLORS = [
  "#4f6bed",
  "#a78bfa",
  "#34d399",
  "#f59e0b",
  "#f87171",
  "#38bdf8",
  "#fb7185",
  "#4ade80",
  "#c084fc",
  "#fbbf24",
];

const BAR_TOOLTIP_STYLE: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  color: "#0f172a",
  fontSize: 12,
};

function CustomPieTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: "8px 12px",
        color: "#0f172a",
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: entry.payload?.color ?? entry.color,
          flexShrink: 0,
        }}
      />
      <span style={{ color: "#64748b" }}>{entry.name}</span>
      <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        {formatCurrency(entry.value ?? 0)}
      </span>
    </div>
  );
}

function formatCurrency(amount: number): string {
  return `$${Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatAxisValue(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value}`;
}

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("current");
  const { activeAccountId, hasNoAccounts, isLoading: accountsLoading } = useActiveAccount();

  const {
    data: txData,
    error: txError,
    isLoading: txLoading,
    mutate: retryTransactions,
  } = useSWR(
    activeAccountId ? transactionsSwrKey(activeAccountId) : null,
    () => fetchTransactions(activeAccountId as string),
  );
  const { data: categories = [] } = useSWR(
    activeAccountId ? categoriesSwrKey(activeAccountId) : null,
    () => fetchCategories(activeAccountId as string),
  );

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    const end = endOfMonth(now);
    if (timeRange === "current") {
      return {
        startDate: format(startOfMonth(now), "yyyy-MM-dd"),
        endDate: format(end, "yyyy-MM-dd"),
      };
    }
    return {
      startDate: format(startOfMonth(subMonths(now, 2)), "yyyy-MM-dd"),
      endDate: format(end, "yyyy-MM-dd"),
    };
  }, [timeRange]);

  const allTransactions = useMemo(() => {
    if (!txData) return [];
    const txRows = txData.transactions.map((row) => ({
      id: row.id,
      label: row.label,
      amount: Number(row.amount),
      date: row.date,
      category_id: row.category_id ?? null,
    }));
    const rules = txData.recurringRules.map(mapRecurringRuleRow);
    const expanded = expandRecurringForDateRange(
      rules,
      startDate,
      endDate,
      txData.exceptions ?? [],
    );
    return [...txRows, ...expanded].filter(
      (t) => t.date >= startDate && t.date <= endDate,
    );
  }, [txData, startDate, endDate]);

  const summary = useMemo(() => {
    let totalIncome = 0;
    let totalSpent = 0;
    for (const t of allTransactions) {
      if (t.amount > 0) totalIncome += t.amount;
      else totalSpent += t.amount;
    }
    return { totalIncome, totalSpent, net: totalIncome + totalSpent };
  }, [allTransactions]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of allTransactions) {
      if (t.amount >= 0) continue;
      const key = t.category_id ?? "__uncategorized__";
      map.set(key, (map.get(key) ?? 0) + Math.abs(t.amount));
    }
    const total = Math.abs(summary.totalSpent);
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([key, amount], i) => {
        const cat = categories.find((c) => c.id === key);
        return {
          name: cat?.name ?? "Uncategorized",
          amount,
          percentage: total > 0 ? (amount / total) * 100 : 0,
          color: CHART_COLORS[i % CHART_COLORS.length],
        };
      });
  }, [allTransactions, categories, summary.totalSpent]);

  const timeSeriesData = useMemo(() => {
    if (timeRange === "current") {
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      const weeks = eachWeekOfInterval(
        { start: monthStart, end: monthEnd },
        { weekStartsOn: 0 },
      );
      return weeks.map((weekStart, i) => {
        const effectiveStart = dateMax([weekStart, monthStart]);
        const effectiveEnd = dateMin([addDays(weekStart, 6), monthEnd]);
        const wStart = format(effectiveStart, "yyyy-MM-dd");
        const wEnd = format(effectiveEnd, "yyyy-MM-dd");
        let income = 0;
        let expenses = 0;
        for (const t of allTransactions) {
          if (t.date < wStart || t.date > wEnd) continue;
          if (t.amount > 0) income += t.amount;
          else expenses += Math.abs(t.amount);
        }
        return { period: `Wk ${i + 1}`, income, expenses };
      });
    }
    const now = new Date();
    return [2, 1, 0].map((ago) => {
      const m = subMonths(now, ago);
      const mStart = format(startOfMonth(m), "yyyy-MM-dd");
      const mEnd = format(endOfMonth(m), "yyyy-MM-dd");
      let income = 0;
      let expenses = 0;
      for (const t of allTransactions) {
        if (t.date < mStart || t.date > mEnd) continue;
        if (t.amount > 0) income += t.amount;
        else expenses += Math.abs(t.amount);
      }
      return { period: format(m, "MMM"), income, expenses };
    });
  }, [allTransactions, timeRange]);

  const isLoading = !activeAccountId || (txLoading && !txData);
  const hasNoTimeSeriesData = timeSeriesData.every(
    (d) => d.income === 0 && d.expenses === 0,
  );

  if (!accountsLoading && hasNoAccounts) {
    return (
      <div className="flex flex-col px-5 pb-6 pt-12 text-white">
        <div className="glass-card flex flex-col items-center gap-4 rounded-2xl px-6 py-10 text-center">
          <h2 className="text-base font-semibold text-white">
            Create your first budget
          </h2>
          <p className="text-sm text-white/70">
            You don&apos;t have a budget yet. Set one up in Settings to start
            tracking transactions.
          </p>
          <Link
            href="/settings"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/80"
          >
            Go to Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-x-clip">
      <header className="page-enter-1 px-5 pb-4 pt-6">
        <h1 className="text-xl font-semibold text-white">Analytics</h1>
        <p className="text-sm text-white/70">Your spending insights</p>
      </header>

      <div className="flex flex-col gap-6 px-5 pb-6">
        {/* Time range toggle */}
        <div className="page-enter-2 glass-card relative flex gap-2 rounded-xl p-1">
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute bottom-1 left-1 top-1 z-0 w-[calc((100%-1rem)/2)] rounded-lg bg-white/25 transition-transform duration-200",
              timeRange === "last3" && "translate-x-[calc(100%+0.5rem)]",
            )}
          />
          <button
            type="button"
            onClick={() => setTimeRange("current")}
            className={cn(
              "relative z-10 flex-1 rounded-lg py-2 text-sm font-medium transition-colors duration-200",
              timeRange === "current" ? "text-white" : "text-white/60 hover:text-white/80",
            )}
          >
            This Month
          </button>
          <button
            type="button"
            onClick={() => setTimeRange("last3")}
            className={cn(
              "relative z-10 flex-1 rounded-lg py-2 text-sm font-medium transition-colors duration-200",
              timeRange === "last3" ? "text-white" : "text-white/60 hover:text-white/80",
            )}
          >
            Last 3 Months
          </button>
        </div>

        {txError && (
          <ErrorBanner
            variant="panel"
            message="Couldn't load data. Check your connection and try again."
            onRetry={() => void retryTransactions()}
          />
        )}

        {isLoading && <p className="text-sm text-white/70">Loading…</p>}

        {!isLoading && !txError && (
          <>
            {/* Summary stats */}
            <div className="page-enter-3 grid grid-cols-3 gap-3">
              <div className="glass-card rounded-2xl px-3 py-4 text-center">
                <p className="text-xs font-medium text-white/60">Spent</p>
                <p className="mt-1 text-base font-bold tabular-nums text-[#e11d48]">
                  {formatCurrency(summary.totalSpent)}
                </p>
              </div>
              <div className="glass-card rounded-2xl px-3 py-4 text-center">
                <p className="text-xs font-medium text-white/60">Income</p>
                <p className="mt-1 text-base font-bold tabular-nums text-[#4ade80]">
                  {formatCurrency(summary.totalIncome)}
                </p>
              </div>
              <div className="glass-card rounded-2xl px-3 py-4 text-center">
                <p className="text-xs font-medium text-white/60">Net</p>
                <p
                  className={cn(
                    "mt-1 text-base font-bold tabular-nums",
                    summary.net >= 0 ? "text-[#4ade80]" : "text-[#e11d48]",
                  )}
                >
                  {summary.net >= 0 ? "+" : "−"}{formatCurrency(summary.net)}
                </p>
              </div>
            </div>

            {/* Spending by category */}
            <div className="page-enter-4 glass-card flex flex-col gap-4 rounded-2xl p-4">
              <h2 className="text-sm font-semibold text-white">
                Spending by Category
              </h2>
              {categoryBreakdown.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <p className="text-sm text-white/70">
                    No spending data for this period.
                  </p>
                </div>
              ) : (
                <>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryBreakdown}
                          dataKey="amount"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={3}
                          cornerRadius={4}
                          stroke="none"
                        >
                          {categoryBreakdown.map((entry, i) => (
                            <Cell key={`cell-${i}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomPieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-col gap-2">
                    {categoryBreakdown.map((item) => (
                      <div key={item.name} className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-white/80">
                          {item.name}
                        </span>
                        <span className="shrink-0 text-xs text-white/60">
                          {item.percentage.toFixed(0)}%
                        </span>
                        <span className="shrink-0 text-sm font-medium tabular-nums text-white">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Income vs Expenses */}
            <div className="page-enter-5 glass-card flex flex-col gap-4 rounded-2xl p-4">
              <h2 className="text-sm font-semibold text-white">
                Income vs Expenses
              </h2>
              {hasNoTimeSeriesData ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <p className="text-sm text-white/70">
                    No data for this period.
                  </p>
                </div>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={timeSeriesData}
                      barGap={2}
                      barCategoryGap="30%"
                      margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.1)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="period"
                        tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={formatAxisValue}
                        width={44}
                      />
                      <Tooltip
                        contentStyle={BAR_TOOLTIP_STYLE}
                        cursor={{ fill: "rgba(255,255,255,0.06)" }}
                        formatter={(value, name) => [
                          formatCurrency(Number(value)),
                          String(name).charAt(0).toUpperCase() +
                            String(name).slice(1),
                        ]}
                      />
                      <Bar
                        dataKey="income"
                        name="Income"
                        fill="#4ade80"
                        radius={[3, 3, 0, 0]}
                      />
                      <Bar
                        dataKey="expenses"
                        name="Expenses"
                        fill="#e11d48"
                        radius={[3, 3, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {!hasNoTimeSeriesData && (
                <div className="flex items-center justify-center gap-5">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-sm bg-[#4ade80]" />
                    <span className="text-xs text-white/70">Income</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-sm bg-[#e11d48]" />
                    <span className="text-xs text-white/70">Expenses</span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
