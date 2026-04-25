"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  eachWeekOfInterval,
  addDays,
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
import { fetchTransactions, fetchCategories } from "@/lib/api";
import { expandRecurringForDateRange } from "@/lib/projection";
import { mapRecurringRuleRow } from "@/lib/recurring-rules";
import { cn } from "@/lib/utils";
import { ErrorBanner } from "@/components/error-banner";

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

const TOOLTIP_STYLE: React.CSSProperties = {
  background: "rgba(0,0,0,0.75)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8,
  color: "white",
  fontSize: 12,
};

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

  const {
    data: txData,
    error: txError,
    isLoading: txLoading,
    mutate: retryTransactions,
  } = useSWR("transactions", fetchTransactions);
  const { data: categories = [] } = useSWR("categories", fetchCategories);

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
        const weekEnd = addDays(weekStart, 6);
        const wStart = format(weekStart, "yyyy-MM-dd");
        const wEnd = format(weekEnd, "yyyy-MM-dd");
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

  const isLoading = txLoading && !txData;
  const hasNoTimeSeriesData = timeSeriesData.every(
    (d) => d.income === 0 && d.expenses === 0,
  );

  return (
    <div className="flex flex-col overflow-x-hidden">
      <header className="page-enter-1 px-5 pb-4 pt-6">
        <h1 className="text-xl font-semibold text-white">Analytics</h1>
        <p className="text-sm text-white/70">Your spending insights</p>
      </header>

      <div className="flex flex-col gap-6 px-5 pb-6">
        {/* Time range toggle */}
        <div className="glass-card flex rounded-xl p-1">
          {(["current", "last3"] as TimeRange[]).map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setTimeRange(range)}
              className={cn(
                "flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
                timeRange === range
                  ? "bg-white/20 text-white"
                  : "text-white/60 hover:text-white/80",
              )}
            >
              {range === "current" ? "This Month" : "Last 3 Months"}
            </button>
          ))}
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
            <div className="grid grid-cols-3 gap-3">
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
                  {formatCurrency(summary.net)}
                </p>
              </div>
            </div>

            {/* Spending by category */}
            <div className="glass-card flex flex-col gap-4 rounded-2xl p-4">
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
                          paddingAngle={2}
                        >
                          {categoryBreakdown.map((entry, i) => (
                            <Cell key={`cell-${i}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(value) => [
                            formatCurrency(Number(value)),
                            "",
                          ]}
                        />
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
            <div className="glass-card flex flex-col gap-4 rounded-2xl p-4">
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
                        contentStyle={TOOLTIP_STYLE}
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
