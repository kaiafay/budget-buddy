import { describe, it, expect } from "vitest";
import {
  getProjectedBalances,
  expandRecurringForDateRange,
  sumRecurringBeforeDate,
  getTransactionsForDate,
} from "@/lib/projection";
import type { RecurringException, RecurringRule, Transaction } from "@/lib/types";

describe("getProjectedBalances", () => {
  it("with only one-time transactions", () => {
    const startingBalance = 100;
    const transactions: Transaction[] = [
      { id: "t1", label: "Coffee", amount: -10, date: "2025-01-15" },
      { id: "t2", label: "Paycheck", amount: 50, date: "2025-01-20" },
    ];
    const recurringRules: RecurringRule[] = [];
    const balances = getProjectedBalances(
      startingBalance,
      transactions,
      recurringRules,
      0,
      2025,
    );
    expect(balances["2025-01-14"]).toBe(100);
    expect(balances["2025-01-15"]).toBe(90);
    expect(balances["2025-01-19"]).toBe(90);
    expect(balances["2025-01-20"]).toBe(140);
    expect(balances["2025-01-31"]).toBe(140);
  });

  it("with only recurring monthly transactions", () => {
    const startingBalance = 100;
    const transactions: Transaction[] = [];
    const recurringRules: RecurringRule[] = [
      {
        id: "r1",
        label: "Rent",
        amount: -20,
        frequency: "monthly",
        start_date: "2025-01-01",
      },
    ];
    const balances = getProjectedBalances(
      startingBalance,
      transactions,
      recurringRules,
      0,
      2025,
    );
    expect(balances["2025-01-01"]).toBe(80);
    expect(balances["2025-01-02"]).toBe(80);
    expect(balances["2025-01-31"]).toBe(80);
  });

  it("with a skip exception — skipped date has pre-skip balance", () => {
    const startingBalance = 100;
    const transactions: Transaction[] = [];
    const recurringRules: RecurringRule[] = [
      {
        id: "r1",
        label: "Weekly",
        amount: -10,
        frequency: "weekly",
        start_date: "2025-01-01",
      },
    ];
    const exceptions: RecurringException[] = [
      {
        id: "e1",
        rule_id: "r1",
        exception_date: "2025-01-08",
        type: "skip",
      },
    ];
    const balances = getProjectedBalances(
      startingBalance,
      transactions,
      recurringRules,
      0,
      2025,
      exceptions,
    );
    expect(balances["2025-01-01"]).toBe(90);
    expect(balances["2025-01-07"]).toBe(90);
    expect(balances["2025-01-08"]).toBe(90);
    expect(balances["2025-01-15"]).toBe(80);
  });

  it("with a modified exception — modified amount is used", () => {
    const startingBalance = 100;
    const transactions: Transaction[] = [];
    const recurringRules: RecurringRule[] = [
      {
        id: "r1",
        label: "Rent",
        amount: -20,
        frequency: "monthly",
        start_date: "2025-01-01",
      },
    ];
    const exceptions: RecurringException[] = [
      {
        id: "e1",
        rule_id: "r1",
        exception_date: "2025-01-01",
        type: "modified",
        modified_amount: -5,
      },
    ];
    const balances = getProjectedBalances(
      startingBalance,
      transactions,
      recurringRules,
      0,
      2025,
      exceptions,
    );
    expect(balances["2025-01-01"]).toBe(95);
    expect(balances["2025-01-31"]).toBe(95);
  });

  it("one-time income on March 15 — days before unchanged, days after increased", () => {
    const balances = getProjectedBalances(
      1000,
      [
        { id: "t1", label: "Paycheck", amount: 500, date: "2026-03-15" },
      ],
      [],
      2,
      2026,
    );
    expect(balances["2026-03-14"]).toBe(1000);
    expect(balances["2026-03-15"]).toBe(1500);
    expect(balances["2026-03-31"]).toBe(1500);
  });

  it("monthly recurring starting previous month — hits on March 1 too", () => {
    const balances = getProjectedBalances(
      1000,
      [],
      [
        {
          id: "r1",
          label: "Rent",
          amount: -300,
          frequency: "monthly",
          start_date: "2026-02-01",
        },
      ],
      2,
      2026,
    );
    expect(balances["2026-03-01"]).toBe(700);
    expect(balances["2026-03-31"]).toBe(700);
  });

  it("monthly recurring with end_date on March 15 — last occurrence included, nothing after", () => {
    const balances = getProjectedBalances(
      1000,
      [],
      [
        {
          id: "r1",
          label: "Rent",
          amount: -300,
          frequency: "monthly",
          start_date: "2026-03-01",
          end_date: "2026-03-15",
        },
      ],
      2,
      2026,
    );
    expect(balances["2026-03-01"]).toBe(700);
    expect(balances["2026-03-15"]).toBe(700);
    expect(balances["2026-03-16"]).toBe(700);
  });

  it("weekly recurring — cumulative deductions on correct dates", () => {
    const balances = getProjectedBalances(
      1000,
      [],
      [
        {
          id: "r1",
          label: "Weekly",
          amount: -100,
          frequency: "weekly",
          start_date: "2026-03-01",
        },
      ],
      2,
      2026,
    );
    expect(balances["2026-03-01"]).toBe(900);
    expect(balances["2026-03-08"]).toBe(800);
    expect(balances["2026-03-15"]).toBe(700);
    expect(balances["2026-03-22"]).toBe(600);
    expect(balances["2026-03-29"]).toBe(500);
    expect(balances["2026-03-07"]).toBe(900);
    expect(balances["2026-03-09"]).toBe(800);
  });

  it("one-time transaction and recurring rule both on same day — both amounts applied", () => {
    const balances = getProjectedBalances(
      1000,
      [{ id: "t1", label: "Extra", amount: -50, date: "2026-03-10" }],
      [
        {
          id: "r1",
          label: "Subscription",
          amount: -100,
          frequency: "monthly",
          start_date: "2026-03-10",
        },
      ],
      2,
      2026,
    );
    expect(balances["2026-03-09"]).toBe(1000);
    expect(balances["2026-03-10"]).toBe(850);
    expect(balances["2026-03-11"]).toBe(850);
  });

  it("empty month — no transactions or rules — balance constant for entire month", () => {
    const balances = getProjectedBalances(1000, [], [], 2, 2026);
    expect(balances["2026-03-01"]).toBe(1000);
    expect(balances["2026-03-15"]).toBe(1000);
    expect(balances["2026-03-31"]).toBe(1000);
  });
});

describe("expandRecurringForDateRange", () => {
  it("with weekly frequency", () => {
    const rules: RecurringRule[] = [
      {
        id: "r1",
        label: "Weekly",
        amount: -10,
        frequency: "weekly",
        start_date: "2025-01-01",
      },
    ];
    const result = expandRecurringForDateRange(
      rules,
      "2025-01-01",
      "2025-01-22",
    );
    expect(result.map((r) => r.date)).toEqual([
      "2025-01-01",
      "2025-01-08",
      "2025-01-15",
      "2025-01-22",
    ]);
    expect(result.every((r) => r.amount === -10 && r.recurring)).toBe(true);
  });

  it("with a rule that has end_date — occurrences stop after end_date", () => {
    const rules: RecurringRule[] = [
      {
        id: "r1",
        label: "Weekly",
        amount: -10,
        frequency: "weekly",
        start_date: "2025-01-01",
        end_date: "2025-01-15",
      },
    ];
    const result = expandRecurringForDateRange(
      rules,
      "2025-01-01",
      "2025-01-31",
    );
    expect(result.map((r) => r.date)).toEqual([
      "2025-01-01",
      "2025-01-08",
      "2025-01-15",
    ]);
  });

  it("with a skip exception — that date is excluded", () => {
    const rules: RecurringRule[] = [
      {
        id: "r1",
        label: "Weekly",
        amount: -10,
        frequency: "weekly",
        start_date: "2025-01-01",
      },
    ];
    const exceptions: RecurringException[] = [
      {
        id: "e1",
        rule_id: "r1",
        exception_date: "2025-01-08",
        type: "skip",
      },
    ];
    const result = expandRecurringForDateRange(
      rules,
      "2025-01-01",
      "2025-01-22",
      exceptions,
    );
    expect(result.map((r) => r.date)).toEqual([
      "2025-01-01",
      "2025-01-15",
      "2025-01-22",
    ]);
  });

  it("biweekly rule — returns occurrences every two weeks", () => {
    const result = expandRecurringForDateRange(
      [
        {
          id: "r1",
          label: "Biweekly",
          amount: -50,
          frequency: "biweekly",
          start_date: "2026-03-01",
        },
      ],
      "2026-03-01",
      "2026-03-31",
    );
    expect(result.map((r) => r.date)).toEqual([
      "2026-03-01",
      "2026-03-15",
      "2026-03-29",
    ]);
  });

  it("yearly rule — returns one occurrence in range", () => {
    const result = expandRecurringForDateRange(
      [
        {
          id: "r1",
          label: "Annual",
          amount: -200,
          frequency: "yearly",
          start_date: "2026-03-01",
        },
      ],
      "2026-03-01",
      "2026-03-31",
    );
    expect(result.map((r) => r.date)).toEqual(["2026-03-01"]);
  });

  it("rule starts after range start — first occurrence is rule start_date", () => {
    const result = expandRecurringForDateRange(
      [
        {
          id: "r1",
          label: "Mid month",
          amount: -50,
          frequency: "monthly",
          start_date: "2026-03-15",
        },
      ],
      "2026-03-01",
      "2026-03-31",
    );
    expect(result.map((r) => r.date)).toEqual(["2026-03-15"]);
  });

  it("passes through category_id from rule to each occurrence", () => {
    const result = expandRecurringForDateRange(
      [
        {
          id: "r1",
          label: "Rent",
          amount: -100,
          frequency: "monthly",
          start_date: "2026-03-01",
          category_id: "cat-rent",
        },
      ],
      "2026-03-01",
      "2026-03-31",
    );
    expect(result).toHaveLength(1);
    expect(result[0].category_id).toBe("cat-rent");
    expect(result[0].recurring).toBe(true);
  });

  it("includes null category_id when rule has no category", () => {
    const result = expandRecurringForDateRange(
      [
        {
          id: "r1",
          label: "Rent",
          amount: -100,
          frequency: "monthly",
          start_date: "2026-03-01",
        },
      ],
      "2026-03-01",
      "2026-03-31",
    );
    expect(result).toHaveLength(1);
    expect(result[0].category_id).toBeNull();
  });

  it("rule starts before range — only occurrences within range returned", () => {
    const result = expandRecurringForDateRange(
      [
        {
          id: "r1",
          label: "Monthly",
          amount: -50,
          frequency: "monthly",
          start_date: "2026-01-15",
        },
      ],
      "2026-03-01",
      "2026-03-31",
    );
    expect(result.map((r) => r.date)).toEqual(["2026-03-15"]);
  });

  it("modified exception — date included with modified amount and label", () => {
    const result = expandRecurringForDateRange(
      [
        {
          id: "r1",
          label: "Rent",
          amount: -500,
          frequency: "monthly",
          start_date: "2026-03-01",
        },
      ],
      "2026-03-01",
      "2026-03-31",
      [
        {
          id: "e1",
          rule_id: "r1",
          exception_date: "2026-03-01",
          type: "modified",
          modified_amount: -550,
          modified_label: "Rent (increased)",
        },
      ],
    );
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-03-01");
    expect(result[0].amount).toBe(-550);
    expect(result[0].label).toBe("Rent (increased)");
  });
});

describe("sumRecurringBeforeDate", () => {
  it("with monthly frequency — carry-forward is correct", () => {
    const rules: RecurringRule[] = [
      {
        id: "r1",
        label: "Rent",
        amount: -10,
        frequency: "monthly",
        start_date: "2025-01-01",
      },
    ];
    const sum = sumRecurringBeforeDate(rules, "2025-03-01");
    expect(sum).toBe(-20);
  });

  it("monthly rule 3 months before target — exactly 3 occurrences summed", () => {
    const sum = sumRecurringBeforeDate(
      [
        {
          id: "r1",
          label: "Rent",
          amount: -100,
          frequency: "monthly",
          start_date: "2026-01-01",
        },
      ],
      "2026-04-01",
    );
    expect(sum).toBe(-300);
  });

  it("monthly rule starting after target date — sum is 0", () => {
    const sum = sumRecurringBeforeDate(
      [
        {
          id: "r1",
          label: "Rent",
          amount: -100,
          frequency: "monthly",
          start_date: "2026-05-01",
        },
      ],
      "2026-04-01",
    );
    expect(sum).toBe(0);
  });

  it("monthly rule with end_date before target — only counts up to end_date", () => {
    const sum = sumRecurringBeforeDate(
      [
        {
          id: "r1",
          label: "Rent",
          amount: -100,
          frequency: "monthly",
          start_date: "2026-01-01",
          end_date: "2026-02-01",
        },
      ],
      "2026-04-01",
    );
    expect(sum).toBe(-200);
  });

  it("weekly rule 4 weeks before target — exactly 4 occurrences summed", () => {
    const sum = sumRecurringBeforeDate(
      [
        {
          id: "r1",
          label: "Weekly",
          amount: -25,
          frequency: "weekly",
          start_date: "2026-03-01",
        },
      ],
      "2026-03-29",
    );
    expect(sum).toBe(-100);
  });

  it("skip exception before target — that occurrence excluded from sum", () => {
    const sum = sumRecurringBeforeDate(
      [
        {
          id: "r1",
          label: "Rent",
          amount: -100,
          frequency: "monthly",
          start_date: "2026-01-01",
        },
      ],
      "2026-04-01",
      [
        {
          id: "e1",
          rule_id: "r1",
          exception_date: "2026-02-01",
          type: "skip",
        },
      ],
    );
    expect(sum).toBe(-200);
  });

  it("modified exception before target — modified amount used not original", () => {
    const sum = sumRecurringBeforeDate(
      [
        {
          id: "r1",
          label: "Rent",
          amount: -100,
          frequency: "monthly",
          start_date: "2026-01-01",
        },
      ],
      "2026-04-01",
      [
        {
          id: "e1",
          rule_id: "r1",
          exception_date: "2026-02-01",
          type: "modified",
          modified_amount: -150,
        },
      ],
    );
    expect(sum).toBe(-350);
  });
});

describe("getTransactionsForDate", () => {
  it("returns one-time and recurring for the given date with recurring flag set", () => {
    const monthTx = [
      { id: "t1", label: "Coffee", amount: -5, date: "2026-03-10" },
    ];
    const rules: RecurringRule[] = [
      {
        id: "r1",
        label: "Subscription",
        amount: -100,
        frequency: "monthly",
        start_date: "2026-03-10",
      },
    ];
    const result = getTransactionsForDate(
      monthTx,
      rules,
      "2026-03-01",
      "2026-03-31",
      "2026-03-10",
    );
    expect(result).toHaveLength(2);
    expect(
      result.map((t) => ({ id: t.id, amount: t.amount, recurring: t.recurring })),
    ).toEqual([
      { id: "t1", amount: -5, recurring: false },
      { id: "r1-2026-03-10", amount: -100, recurring: true },
    ]);
  });

  it("returns only transactions for the requested date", () => {
    const monthTx = [
      { id: "t1", label: "Other", amount: -10, date: "2026-03-05" },
    ];
    const result = getTransactionsForDate(
      monthTx,
      [],
      "2026-03-01",
      "2026-03-31",
      "2026-03-10",
    );
    expect(result).toHaveLength(0);
  });

  it("sorts by date and applies modified exception for recurring", () => {
    const rules: RecurringRule[] = [
      {
        id: "r1",
        label: "Rent",
        amount: -500,
        frequency: "monthly",
        start_date: "2026-03-01",
      },
    ];
    const exceptions: RecurringException[] = [
      {
        id: "e1",
        rule_id: "r1",
        exception_date: "2026-03-01",
        type: "modified",
        modified_amount: -550,
        modified_label: "Rent (increased)",
      },
    ];
    const result = getTransactionsForDate(
      [],
      rules,
      "2026-03-01",
      "2026-03-31",
      "2026-03-01",
      exceptions,
    );
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(-550);
    expect(result[0].label).toBe("Rent (increased)");
    expect(result[0].recurring).toBe(true);
  });

  it("passes through category_id for one-time transactions", () => {
    const monthTx = [
      {
        id: "t1",
        label: "Coffee",
        amount: -5,
        date: "2026-03-10",
        category_id: "cat-food",
      },
    ];
    const result = getTransactionsForDate(
      monthTx,
      [],
      "2026-03-01",
      "2026-03-31",
      "2026-03-10",
    );
    expect(result).toHaveLength(1);
    expect(result[0].category_id).toBe("cat-food");
    expect(result[0].recurring).toBe(false);
  });

  it("passes through category_id from rule for recurring occurrences", () => {
    const rules: RecurringRule[] = [
      {
        id: "r1",
        label: "Subscription",
        amount: -100,
        frequency: "monthly",
        start_date: "2026-03-10",
        category_id: "cat-sub",
      },
    ];
    const result = getTransactionsForDate(
      [],
      rules,
      "2026-03-01",
      "2026-03-31",
      "2026-03-10",
    );
    expect(result).toHaveLength(1);
    expect(result[0].category_id).toBe("cat-sub");
    expect(result[0].recurring).toBe(true);
  });
});
