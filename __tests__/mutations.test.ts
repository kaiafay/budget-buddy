import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  applyRecurringEditFromDate,
  updateRecurringSegmentInPlace,
  splitRecurringRuleAtDate,
  skipRecurringOccurrence,
  upsertModifiedRecurringException,
  endRecurringRuleFuture,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/transactions-mutations";

const mockEq2 = vi.fn().mockResolvedValue({ error: null });
const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 });
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockUpsert = vi.fn().mockResolvedValue({ error: null });
const mockDeleteEq2 = vi.fn().mockResolvedValue({ error: null });
const mockDeleteEq1 = vi.fn().mockReturnValue({ eq: mockDeleteEq2 });
const mockDelete = vi.fn().mockReturnValue({ eq: mockDeleteEq1 });

const mockExceptionDeleteIn = vi.fn().mockResolvedValue({ error: null });
const mockExceptionDeleteGte = vi
  .fn()
  .mockReturnValue({ in: mockExceptionDeleteIn });
const mockExceptionDeleteEqType = vi
  .fn()
  .mockReturnValue({ gte: mockExceptionDeleteGte });
const mockExceptionDeleteEqUser = vi
  .fn()
  .mockReturnValue({ eq: mockExceptionDeleteEqType });
const mockExceptionDelete = vi
  .fn()
  .mockReturnValue({ eq: mockExceptionDeleteEqUser });

type RuleRow = {
  id: string;
  start_date: string;
  end_date: string | null;
  root_rule_id: string | null;
  account_id: string;
  category_id: string | null;
};

const RULE_EDIT_COLS =
  "id, start_date, end_date, root_rule_id, account_id, category_id";

function ruleSelectChain(singleData: RuleRow) {
  return {
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: singleData, error: null }),
      }),
    }),
  };
}

function idSelectForExistingThenChain(
  existingRow: { id: string } | null,
  chainRows: { id: string }[],
) {
  return {
    eq: vi.fn().mockReturnValue({
      or: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi
            .fn()
            .mockResolvedValue({ data: existingRow, error: null }),
        }),
        then: (onFulfilled: (v: unknown) => unknown) =>
          Promise.resolve({ data: chainRows, error: null }).then(onFulfilled),
      }),
    }),
  };
}

function startDateNextChain(next: { start_date: string } | null) {
  return {
    eq: vi.fn().mockReturnValue({
      or: vi.fn().mockReturnValue({
        gt: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi
                .fn()
                .mockResolvedValue({ data: next, error: null }),
            }),
          }),
        }),
      }),
    }),
  };
}

function recurringRulesFromHandlers(opts: {
  fullSelectRules: RuleRow[];
  existingAtPivot?: { id: string } | null;
  chainIds: string[];
  nextSegment?: { start_date: string } | null;
  idSelectModes: ("existing" | "chain")[];
}) {
  const chainRows = opts.chainIds.map((id) => ({ id }));
  const idQueue = [...opts.idSelectModes];
  const fullQueue = [...opts.fullSelectRules];
  let fullSelectCall = 0;

  return {
    select: vi.fn((columns: string) => {
      if (columns === RULE_EDIT_COLS || columns.includes("root_rule_id")) {
        const rule = fullQueue[fullSelectCall];
        if (!rule) {
          throw new Error(
            `fullSelectRules exhausted at call ${fullSelectCall + 1}`,
          );
        }
        fullSelectCall += 1;
        return ruleSelectChain(rule);
      }
      if (columns === "id") {
        const mode = idQueue.shift();
        if (!mode) {
          throw new Error(`Unexpected extra select("id"); queue empty`);
        }
        if (mode === "existing") {
          return idSelectForExistingThenChain(
            opts.existingAtPivot ?? null,
            chainRows,
          );
        }
        return {
          eq: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({ data: chainRows, error: null }),
          }),
        };
      }
      if (columns === "start_date") {
        return startDateNextChain(opts.nextSegment ?? null);
      }
      throw new Error(`Unexpected select columns: ${columns}`);
    }),
    update: mockUpdate,
    insert: mockInsert,
  };
}

let fromTableHandler: (table: string) => Record<string, unknown>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
      }),
    },
    from: vi.fn((table: string) => fromTableHandler(table)),
  })),
}));

describe("applyRecurringEditFromDate", () => {
  const baseRule: RuleRow = {
    id: "rule-1",
    start_date: "2025-02-15",
    end_date: null,
    root_rule_id: null,
    account_id: "acc-123",
    category_id: "cat-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEq2.mockResolvedValue({ error: null });
    mockEq1.mockReturnValue({ eq: mockEq2 });
    mockUpdate.mockReturnValue({ eq: mockEq1 });
    mockInsert.mockResolvedValue({ error: null });
    mockExceptionDeleteIn.mockResolvedValue({ error: null });
    const rr = recurringRulesFromHandlers({
      fullSelectRules: [baseRule, baseRule],
      chainIds: ["rule-1"],
      idSelectModes: ["chain"],
    });
    fromTableHandler = (table: string) => {
      if (table === "recurring_exceptions") {
        return { delete: mockExceptionDelete };
      }
      if (table === "recurring_rules") {
        return rr;
      }
      return {};
    };
  });

  it("uses in-place update when occurrenceDate equals segment start_date", async () => {
    const result = await applyRecurringEditFromDate("rule-1", "2025-02-15", {
      label: "Updated",
      amount: -40,
      frequency: "monthly",
    });
    expect(result.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({
      label: "Updated",
      amount: -40,
      frequency: "monthly",
      category_id: "cat-1",
    });
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockExceptionDelete).toHaveBeenCalled();
    expect(mockExceptionDeleteGte).toHaveBeenCalledWith(
      "exception_date",
      "2025-02-15",
    );
    expect(mockExceptionDeleteIn).toHaveBeenCalledWith("rule_id", ["rule-1"]);
  });

  it("splits at occurrence and inserts segment with root_rule_id when pivot is after start", async () => {
    const splitRule: RuleRow = {
      ...baseRule,
      start_date: "2025-01-01",
    };
    const rr = recurringRulesFromHandlers({
      fullSelectRules: [splitRule, splitRule],
      existingAtPivot: null,
      chainIds: ["rule-1"],
      nextSegment: null,
      idSelectModes: ["existing", "chain"],
    });
    fromTableHandler = (table: string) => {
      if (table === "recurring_exceptions") {
        return { delete: mockExceptionDelete };
      }
      if (table === "recurring_rules") {
        return rr;
      }
      return {};
    };

    const result = await applyRecurringEditFromDate("rule-1", "2025-02-15", {
      label: "New Rent",
      amount: -25,
      frequency: "monthly",
    });

    expect(result.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({ end_date: "2025-02-14" });
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: "user-1",
      account_id: "acc-123",
      label: "New Rent",
      amount: -25,
      frequency: "monthly",
      start_date: "2025-02-15",
      end_date: null,
      root_rule_id: "rule-1",
      category_id: "cat-1",
    });
    expect(mockExceptionDeleteGte).toHaveBeenCalledWith(
      "exception_date",
      "2025-02-15",
    );
    expect(mockExceptionDeleteIn).toHaveBeenCalledWith("rule_id", ["rule-1"]);
  });

  it("updates existing chain segment in place when pivot matches another segment start_date (no insert)", async () => {
    const splitRule: RuleRow = {
      ...baseRule,
      start_date: "2025-01-01",
    };
    const existingSeg = { id: "rule-seg-2" };
    const ruleAtSeg2: RuleRow = {
      id: "rule-seg-2",
      start_date: "2025-02-15",
      end_date: null,
      root_rule_id: "rule-1",
      account_id: "acc-123",
      category_id: "cat-1",
    };
    const rr = recurringRulesFromHandlers({
      fullSelectRules: [splitRule, splitRule, ruleAtSeg2],
      existingAtPivot: existingSeg,
      chainIds: ["rule-1", "rule-seg-2"],
      idSelectModes: ["existing", "chain"],
    });
    fromTableHandler = (table: string) => {
      if (table === "recurring_exceptions") {
        return { delete: mockExceptionDelete };
      }
      if (table === "recurring_rules") {
        return rr;
      }
      return {};
    };

    const result = await applyRecurringEditFromDate("rule-1", "2025-02-15", {
      label: "Merged",
      amount: -10,
      frequency: "weekly",
    });

    expect(result.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({
      label: "Merged",
      amount: -10,
      frequency: "weekly",
      category_id: "cat-1",
    });
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockExceptionDeleteIn).toHaveBeenCalledWith("rule_id", [
      "rule-1",
      "rule-seg-2",
    ]);
  });

  it("caps new segment end_date when a later chain segment exists", async () => {
    const splitRule: RuleRow = {
      id: "rule-A",
      start_date: "2025-01-01",
      end_date: null,
      root_rule_id: null,
      account_id: "acc-123",
      category_id: "cat-1",
    };
    const rr = recurringRulesFromHandlers({
      fullSelectRules: [splitRule, splitRule],
      existingAtPivot: null,
      chainIds: ["rule-A"],
      nextSegment: { start_date: "2026-03-01" },
      idSelectModes: ["existing", "chain"],
    });
    fromTableHandler = (table: string) => {
      if (table === "recurring_exceptions") {
        return { delete: mockExceptionDelete };
      }
      if (table === "recurring_rules") {
        return rr;
      }
      return {};
    };

    const result = await applyRecurringEditFromDate("rule-A", "2026-02-01", {
      label: "Rent",
      amount: -150,
      frequency: "monthly",
    });

    expect(result.error).toBeNull();
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        end_date: "2026-02-28",
        root_rule_id: "rule-A",
      }),
    );
  });
});

describe("updateRecurringSegmentInPlace", () => {
  const rule: RuleRow = {
    id: "rule-1",
    start_date: "2025-03-01",
    end_date: null,
    root_rule_id: null,
    account_id: "acc",
    category_id: "c1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEq2.mockResolvedValue({ error: null });
    mockEq1.mockReturnValue({ eq: mockEq2 });
    mockUpdate.mockReturnValue({ eq: mockEq1 });
    mockExceptionDeleteIn.mockResolvedValue({ error: null });
    const rr = recurringRulesFromHandlers({
      fullSelectRules: [rule, rule],
      chainIds: ["rule-1", "rule-2"],
      idSelectModes: ["chain"],
    });
    fromTableHandler = (table: string) => {
      if (table === "recurring_exceptions") {
        return { delete: mockExceptionDelete };
      }
      if (table === "recurring_rules") {
        return rr;
      }
      return {};
    };
  });

  it("deletes modified exceptions for the chain from segment start_date", async () => {
    const result = await updateRecurringSegmentInPlace("rule-1", {
      label: "X",
      amount: -1,
      frequency: "monthly",
    });
    expect(result.error).toBeNull();
    expect(mockExceptionDeleteIn).toHaveBeenCalledWith("rule_id", [
      "rule-1",
      "rule-2",
    ]);
    expect(mockExceptionDeleteGte).toHaveBeenCalledWith(
      "exception_date",
      "2025-03-01",
    );
  });

  it("updates start_date when newStartDate differs and uses min date for exception cleanup pivot", async () => {
    const result = await updateRecurringSegmentInPlace("rule-1", {
      label: "X",
      amount: -1,
      frequency: "monthly",
      newStartDate: "2025-03-15",
    });
    expect(result.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "X",
        start_date: "2025-03-15",
      }),
    );
    expect(mockExceptionDeleteGte).toHaveBeenCalledWith(
      "exception_date",
      "2025-03-01",
    );
  });

  it("uses earlier newStartDate in exception cleanup pivot when moving start backward", async () => {
    const laterStart: RuleRow = {
      ...rule,
      start_date: "2025-03-10",
    };
    const rr = recurringRulesFromHandlers({
      fullSelectRules: [laterStart],
      chainIds: ["rule-1", "rule-2"],
      idSelectModes: ["chain"],
    });
    fromTableHandler = (table: string) => {
      if (table === "recurring_exceptions") {
        return { delete: mockExceptionDelete };
      }
      if (table === "recurring_rules") {
        return rr;
      }
      return {};
    };

    const result = await updateRecurringSegmentInPlace("rule-1", {
      label: "X",
      amount: -1,
      frequency: "monthly",
      newStartDate: "2025-03-01",
    });
    expect(result.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ start_date: "2025-03-01" }),
    );
    expect(mockExceptionDeleteGte).toHaveBeenCalledWith(
      "exception_date",
      "2025-03-01",
    );
  });
});

describe("splitRecurringRuleAtDate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq2.mockResolvedValue({ error: null });
    mockEq1.mockReturnValue({ eq: mockEq2 });
    mockUpdate.mockReturnValue({ eq: mockEq1 });
    mockInsert.mockResolvedValue({ error: null });
    mockExceptionDeleteIn.mockResolvedValue({ error: null });
  });

  it("returns error when occurrence is not after segment start_date", async () => {
    const rule: RuleRow = {
      id: "rule-1",
      start_date: "2025-02-15",
      end_date: null,
      root_rule_id: null,
      account_id: "acc",
      category_id: null,
    };
    const rr = recurringRulesFromHandlers({
      fullSelectRules: [rule],
      chainIds: ["rule-1"],
      idSelectModes: [],
    });
    fromTableHandler = (table: string) => {
      if (table === "recurring_rules") {
        return rr;
      }
      return {};
    };
    const result = await splitRecurringRuleAtDate("rule-1", "2025-02-15", {
      label: "X",
      amount: -1,
      frequency: "monthly",
    });
    expect(result.error).not.toBeNull();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("inserts new segment with newStartDate as start_date when it differs from occurrenceDate", async () => {
    const splitRule: RuleRow = {
      id: "rule-1",
      start_date: "2025-01-01",
      end_date: null,
      root_rule_id: null,
      account_id: "acc-123",
      category_id: "cat-1",
    };
    const rr = recurringRulesFromHandlers({
      fullSelectRules: [splitRule],
      existingAtPivot: null,
      chainIds: ["rule-1"],
      nextSegment: null,
      idSelectModes: ["existing", "chain"],
    });
    fromTableHandler = (table: string) => {
      if (table === "recurring_exceptions") {
        return { delete: mockExceptionDelete };
      }
      if (table === "recurring_rules") {
        return rr;
      }
      return {};
    };

    const result = await splitRecurringRuleAtDate("rule-1", "2025-02-15", {
      label: "Rent",
      amount: -25,
      frequency: "monthly",
      newStartDate: "2025-02-20",
    });

    expect(result.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({ end_date: "2025-02-14" });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        start_date: "2025-02-20",
        label: "Rent",
      }),
    );
    expect(mockExceptionDeleteGte).toHaveBeenCalledWith(
      "exception_date",
      "2025-02-15",
    );
  });
});

describe("upsertModifiedRecurringException", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ error: null });
    fromTableHandler = (table: string) => {
      if (table === "recurring_exceptions") {
        return { upsert: mockUpsert };
      }
      return {};
    };
  });

  it("upserts recurring_exceptions with type modified, modified_amount, modified_label, rule_id, exception_date, user_id and onConflict rule_id,exception_date", async () => {
    const result = await upsertModifiedRecurringException(
      "rule-1",
      "2025-03-01",
      { label: "Adjusted", amount: -99.5 },
    );
    expect(result.error).toBeNull();
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        rule_id: "rule-1",
        exception_date: "2025-03-01",
        type: "modified",
        modified_amount: -99.5,
        modified_label: "Adjusted",
        category_id: null,
      },
      { onConflict: "rule_id,exception_date" },
    );
  });

  it("includes category_id in upsert row when provided", async () => {
    const result = await upsertModifiedRecurringException(
      "rule-1",
      "2025-03-01",
      { label: "Adjusted", amount: -10, category_id: "cat-x" },
    );
    expect(result.error).toBeNull();
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        rule_id: "rule-1",
        exception_date: "2025-03-01",
        type: "modified",
        modified_amount: -10,
        modified_label: "Adjusted",
        category_id: "cat-x",
      },
      { onConflict: "rule_id,exception_date" },
    );
  });

  it("returns error when upsert fails", async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: "DB error" } });
    const result = await upsertModifiedRecurringException(
      "rule-1",
      "2025-03-01",
      { label: "Adjusted", amount: -10 },
    );
    expect(result.error).not.toBeNull();
  });
});

describe("skipRecurringOccurrence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ error: null });
    fromTableHandler = (table: string) => {
      if (table === "recurring_exceptions") {
        return { upsert: mockUpsert };
      }
      return {};
    };
  });

  it("upserts recurring_exceptions with type skip and onConflict rule_id,exception_date", async () => {
    const result = await skipRecurringOccurrence("rule-1", "2025-02-15");
    expect(result.error).toBeNull();
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        rule_id: "rule-1",
        exception_date: "2025-02-15",
        type: "skip",
      },
      { onConflict: "rule_id,exception_date" },
    );
  });

  it("returns error when upsert fails", async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: "DB error" } });
    const result = await skipRecurringOccurrence("rule-1", "2025-02-15");
    expect(result.error).not.toBeNull();
  });
});

describe("endRecurringRuleFuture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq2.mockResolvedValue({ error: null });
    mockEq1.mockReturnValue({ eq: mockEq2 });
    mockUpdate.mockReturnValue({ eq: mockEq1 });
    fromTableHandler = (table: string) => {
      if (table === "recurring_rules") {
        return { update: mockUpdate };
      }
      return {};
    };
  });

  it("updates recurring_rules with end_date and filters by id and user_id", async () => {
    const result = await endRecurringRuleFuture("rule-1", "2025-03-15");
    expect(result.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({ end_date: "2025-03-15" });
    expect(mockEq1).toHaveBeenCalledWith("id", "rule-1");
    expect(mockEq2).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("returns error when update fails", async () => {
    mockEq2.mockResolvedValueOnce({ error: { message: "DB error" } });
    const result = await endRecurringRuleFuture("rule-1", "2025-03-15");
    expect(result.error).not.toBeNull();
  });
});

describe("createCategory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
    fromTableHandler = (table: string) => {
      if (table === "categories") {
        return { insert: mockInsert };
      }
      return {};
    };
  });

  it("inserts category with user_id, name, icon, type", async () => {
    const result = await createCategory({
      name: "Groceries",
      icon: "ShoppingCart",
      type: "expense",
    });
    expect(result.error).toBeNull();
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: "user-1",
      name: "Groceries",
      icon: "ShoppingCart",
      type: "expense",
    });
  });

  it("returns error when insert fails", async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: "DB error" } });
    const result = await createCategory({
      name: "Groceries",
      icon: "ShoppingCart",
      type: "expense",
    });
    expect(result.error).not.toBeNull();
  });
});

describe("updateCategory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq2.mockResolvedValue({ error: null });
    mockEq1.mockReturnValue({ eq: mockEq2 });
    mockUpdate.mockReturnValue({ eq: mockEq1 });
    fromTableHandler = (table: string) => {
      if (table === "categories") {
        return { update: mockUpdate };
      }
      return {};
    };
  });

  it("updates category with payload and filters by id and user_id", async () => {
    const result = await updateCategory("cat-1", {
      name: "Food",
      icon: "UtensilsCrossed",
      type: "expense",
    });
    expect(result.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({
      name: "Food",
      icon: "UtensilsCrossed",
      type: "expense",
    });
    expect(mockEq1).toHaveBeenCalledWith("id", "cat-1");
    expect(mockEq2).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("returns error when update fails", async () => {
    mockEq2.mockResolvedValueOnce({ error: { message: "DB error" } });
    const result = await updateCategory("cat-1", { name: "Food" });
    expect(result.error).not.toBeNull();
  });
});

describe("deleteCategory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteEq2.mockResolvedValue({ error: null });
    mockDeleteEq1.mockReturnValue({ eq: mockDeleteEq2 });
    mockDelete.mockReturnValue({ eq: mockDeleteEq1 });
    fromTableHandler = (table: string) => {
      if (table === "categories") {
        return { delete: mockDelete };
      }
      return {};
    };
  });

  it("deletes category and filters by id and user_id", async () => {
    const result = await deleteCategory("cat-1");
    expect(result.error).toBeNull();
    expect(mockDelete).toHaveBeenCalled();
    expect(mockDeleteEq1).toHaveBeenCalledWith("id", "cat-1");
    expect(mockDeleteEq2).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("returns error when delete fails", async () => {
    mockDeleteEq2.mockResolvedValueOnce({ error: { message: "DB error" } });
    const result = await deleteCategory("cat-1");
    expect(result.error).not.toBeNull();
  });
});
