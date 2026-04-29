import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  applyRecurringEditFromDate,
  createRecurringRule,
  createTransaction,
  deleteCategory,
  deleteTransaction,
  makeTransactionRecurring,
  updateRecurringSegmentInPlace,
  splitRecurringRuleAtDate,
  skipRecurringOccurrence,
  upsertModifiedRecurringException,
  moveRecurringOccurrence,
  endRecurringRuleFuture,
  createCategory,
  updateCategory,
} from "@/lib/transactions-mutations";
import {
  createRecurringRulePayloadSchema,
  recurringSegmentPayloadSchema,
} from "@/lib/validation";

const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "22222222-2222-4222-8222-222222222222";
const R_SEG2 = "33333333-3333-4333-8333-333333333333";
const RA = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const CAT1 = "44444444-4444-4444-8444-444444444444";
const CAT_X = "55555555-5555-5555-8555-555555555555";
const ACC1 = "66666666-6666-4666-8666-666666666666";
const ACC123 = "77777777-7777-4777-8777-777777777777";
const TX_NEW = "88888888-8888-4888-8888-888888888888";

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
const mockExceptionDelete = vi
  .fn()
  .mockReturnValue({ eq: mockExceptionDeleteEqType });

type RuleRow = {
  id: string;
  start_date: string;
  end_date: string | null;
  root_rule_id: string | null;
  account_id: string;
  category_id: string | null;
};

const RULE_EDIT_COLS = "id, start_date, root_rule_id, account_id, category_id";

function ruleSelectChain(singleData: RuleRow) {
  return {
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: singleData, error: null }),
    }),
  };
}

function idSelectForExistingThenChain(
  existingRow: { id: string } | null,
  chainRows: { id: string }[],
) {
  return {
    or: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: existingRow, error: null }),
      }),
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve({ data: chainRows, error: null }).then(onFulfilled),
    }),
  };
}

function startDateNextChain(next: { start_date: string } | null) {
  return {
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
          or: vi.fn().mockResolvedValue({ data: chainRows, error: null }),
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
    id: R1,
    start_date: "2025-02-15",
    end_date: null,
    root_rule_id: null,
    account_id: ACC123,
    category_id: CAT1,
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
      chainIds: [R1],
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
    const result = await applyRecurringEditFromDate(R1, "2025-02-15", {
      label: "Updated",
      amount: -40,
      frequency: "monthly",
    });
    expect(result.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({
      label: "Updated",
      amount: -40,
      frequency: "monthly",
      category_id: CAT1,
    });
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockExceptionDelete).toHaveBeenCalled();
    expect(mockExceptionDeleteGte).toHaveBeenCalledWith(
      "exception_date",
      "2025-02-15",
    );
    expect(mockExceptionDeleteIn).toHaveBeenCalledWith("rule_id", [R1]);
  });

  it("splits at occurrence and inserts segment with root_rule_id when pivot is after start", async () => {
    const splitRule: RuleRow = {
      ...baseRule,
      start_date: "2025-01-01",
    };
    const rr = recurringRulesFromHandlers({
      fullSelectRules: [splitRule, splitRule],
      existingAtPivot: null,
      chainIds: [R1],
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

    const result = await applyRecurringEditFromDate(R1, "2025-02-15", {
      label: "New Rent",
      amount: -25,
      frequency: "monthly",
    });

    expect(result.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({ end_date: "2025-02-14" });
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: "user-1",
      account_id: ACC123,
      label: "New Rent",
      amount: -25,
      frequency: "monthly",
      start_date: "2025-02-15",
      end_date: null,
      root_rule_id: R1,
      category_id: CAT1,
    });
    expect(mockExceptionDeleteGte).toHaveBeenCalledWith(
      "exception_date",
      "2025-02-15",
    );
    expect(mockExceptionDeleteIn).toHaveBeenCalledWith("rule_id", [R1]);
  });

  it("updates existing chain segment in place when pivot matches another segment start_date (no insert)", async () => {
    const splitRule: RuleRow = {
      ...baseRule,
      start_date: "2025-01-01",
    };
    const existingSeg = { id: R_SEG2 };
    const ruleAtSeg2: RuleRow = {
      id: R_SEG2,
      start_date: "2025-02-15",
      end_date: null,
      root_rule_id: R1,
      account_id: ACC123,
      category_id: CAT1,
    };
    const rr = recurringRulesFromHandlers({
      fullSelectRules: [splitRule, splitRule, ruleAtSeg2],
      existingAtPivot: existingSeg,
      chainIds: [R1, R_SEG2],
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

    const result = await applyRecurringEditFromDate(R1, "2025-02-15", {
      label: "Merged",
      amount: -10,
      frequency: "weekly",
    });

    expect(result.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({
      label: "Merged",
      amount: -10,
      frequency: "weekly",
      category_id: CAT1,
    });
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockExceptionDeleteIn).toHaveBeenCalledWith("rule_id", [R1, R_SEG2]);
  });

  it("caps new segment end_date when a later chain segment exists", async () => {
    const splitRule: RuleRow = {
      id: RA,
      start_date: "2025-01-01",
      end_date: null,
      root_rule_id: null,
      account_id: ACC123,
      category_id: CAT1,
    };
    const rr = recurringRulesFromHandlers({
      fullSelectRules: [splitRule, splitRule],
      existingAtPivot: null,
      chainIds: [RA],
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

    const result = await applyRecurringEditFromDate(RA, "2026-02-01", {
      label: "Rent",
      amount: -150,
      frequency: "monthly",
    });

    expect(result.error).toBeNull();
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        end_date: "2026-02-28",
        root_rule_id: RA,
      }),
    );
  });

  describe("occurrence before segment start", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockEq2.mockResolvedValue({ error: null });
      mockEq1.mockReturnValue({ eq: mockEq2 });
      mockUpdate.mockReturnValue({ eq: mockEq1 });
      mockInsert.mockResolvedValue({ error: null });
      const lateStartRule: RuleRow = {
        id: R1,
        start_date: "2026-02-01",
        end_date: null,
        root_rule_id: null,
        account_id: ACC123,
        category_id: CAT1,
      };
      const rr = recurringRulesFromHandlers({
        fullSelectRules: [lateStartRule],
        chainIds: [],
        idSelectModes: [],
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

    it("returns error when occurrenceDate is before rule start_date", async () => {
      const result = await applyRecurringEditFromDate(R1, "2026-01-01", {
        label: "Test",
        amount: -100,
        frequency: "monthly",
      });
      expect(result.error).not.toBeNull();
      expect(result.error?.message).toMatch(/before/i);
    });
  });
});

describe("createRecurringRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
    fromTableHandler = (table: string) => {
      if (table === "recurring_rules") {
        return { insert: mockInsert };
      }
      return {};
    };
  });

  it("sets root_rule_id to null on new rules", async () => {
    await createRecurringRule({
      accountId: ACC1,
      label: "Rent",
      amount: -500,
      frequency: "monthly",
      startDate: "2026-01-01",
    });
    const insertCall = mockInsert.mock.calls[0][0] as {
      root_rule_id: string | null;
    };
    expect(insertCall.root_rule_id).toBeNull();
  });
});

describe("updateRecurringSegmentInPlace", () => {
  const rule: RuleRow = {
    id: R1,
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
      chainIds: [R1, R2],
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
    const result = await updateRecurringSegmentInPlace(R1, {
      label: "X",
      amount: -1,
      frequency: "monthly",
    });
    expect(result.error).toBeNull();
    expect(mockExceptionDeleteIn).toHaveBeenCalledWith("rule_id", [R1, R2]);
    expect(mockExceptionDeleteGte).toHaveBeenCalledWith(
      "exception_date",
      "2025-03-01",
    );
  });

  it("updates start_date when newStartDate differs and uses min date for exception cleanup pivot", async () => {
    const result = await updateRecurringSegmentInPlace(R1, {
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

  it("does not include end_date in update row when neither endDate nor recurrenceCount provided", async () => {
    await updateRecurringSegmentInPlace(R1, {
      label: "X",
      amount: -1,
      frequency: "monthly",
    });
    const updateCall = mockUpdate.mock.calls[0][0] as Record<string, unknown>;
    expect("end_date" in updateCall).toBe(false);
  });

  it("persists explicit endDate in update row", async () => {
    await updateRecurringSegmentInPlace(R1, {
      label: "X",
      amount: -1,
      frequency: "monthly",
      endDate: "2027-12-31",
    });
    const updateCall = mockUpdate.mock.calls[0][0] as Record<string, unknown>;
    expect(updateCall.end_date).toBe("2027-12-31");
  });

  it("computes end_date from recurrenceCount when no endDate provided", async () => {
    await updateRecurringSegmentInPlace(R1, {
      label: "X",
      amount: -1,
      frequency: "monthly",
      recurrenceCount: 3,
    });
    const updateCall = mockUpdate.mock.calls[0][0] as Record<string, unknown>;
    // start_date is "2025-03-01", monthly x3: 03-01, 04-01, 05-01
    expect(updateCall.end_date).toBe("2025-05-01");
  });

  it("uses earlier newStartDate in exception cleanup pivot when moving start backward", async () => {
    const laterStart: RuleRow = {
      ...rule,
      start_date: "2025-03-10",
    };
    const rr = recurringRulesFromHandlers({
      fullSelectRules: [laterStart],
      chainIds: [R1, R2],
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

    const result = await updateRecurringSegmentInPlace(R1, {
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
      id: R1,
      start_date: "2025-02-15",
      end_date: null,
      root_rule_id: null,
      account_id: "acc",
      category_id: null,
    };
    const rr = recurringRulesFromHandlers({
      fullSelectRules: [rule],
      chainIds: [R1],
      idSelectModes: [],
    });
    fromTableHandler = (table: string) => {
      if (table === "recurring_rules") {
        return rr;
      }
      return {};
    };
    const result = await splitRecurringRuleAtDate(R1, "2025-02-15", {
      label: "X",
      amount: -1,
      frequency: "monthly",
    });
    expect(result.error).not.toBeNull();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("inserts new segment with newStartDate as start_date when it differs from occurrenceDate", async () => {
    const splitRule: RuleRow = {
      id: R1,
      start_date: "2025-01-01",
      end_date: null,
      root_rule_id: null,
      account_id: ACC123,
      category_id: CAT1,
    };
    const rr = recurringRulesFromHandlers({
      fullSelectRules: [splitRule],
      existingAtPivot: null,
      chainIds: [R1],
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

    const result = await splitRecurringRuleAtDate(R1, "2025-02-15", {
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

  it("uses payloadEndDate in inserted segment when no next segment exists", async () => {
    const splitRule: RuleRow = {
      id: R1,
      start_date: "2025-01-01",
      end_date: null,
      root_rule_id: null,
      account_id: ACC123,
      category_id: CAT1,
    };
    const rr = recurringRulesFromHandlers({
      fullSelectRules: [splitRule],
      existingAtPivot: null,
      chainIds: [R1],
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

    const result = await splitRecurringRuleAtDate(R1, "2025-02-15", {
      label: "Rent",
      amount: -25,
      frequency: "monthly",
      endDate: "2026-12-31",
    });

    expect(result.error).toBeNull();
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ end_date: "2026-12-31" }),
    );
  });
});

describe("makeTransactionRecurring", () => {
  const RULE_FOR_MR = "00000000-0000-4000-8000-000000000001";
  const TX_ONE = "99999999-9999-4999-8999-999999999999";

  const mockMrRuleSingle = vi.fn();
  const mockMrRuleSelect = vi.fn(() => ({ single: mockMrRuleSingle }));
  const mockMrRuleInsert = vi.fn(() => ({ select: mockMrRuleSelect }));
  const mockMrRuleDeleteEq2 = vi.fn();
  const mockMrRuleDeleteEq1 = vi.fn(() => ({ eq: mockMrRuleDeleteEq2 }));
  const mockMrRuleDelete = vi.fn(() => ({ eq: mockMrRuleDeleteEq1 }));
  const mockMrTxDeleteEq2 = vi.fn();
  const mockMrTxDeleteEq1 = vi.fn(() => ({ eq: mockMrTxDeleteEq2 }));
  const mockMrTxDelete = vi.fn(() => ({ eq: mockMrTxDeleteEq1 }));

  beforeEach(() => {
    vi.clearAllMocks();
    mockMrRuleSingle.mockResolvedValue({ data: { id: RULE_FOR_MR }, error: null });
    mockMrRuleDeleteEq2.mockResolvedValue({ error: null });
    mockMrTxDeleteEq2.mockResolvedValue({ error: null });
    fromTableHandler = (table: string) => {
      if (table === "recurring_rules") {
        return { insert: mockMrRuleInsert, delete: mockMrRuleDelete };
      }
      if (table === "transactions") {
        return { delete: mockMrTxDelete };
      }
      return {};
    };
  });

  it("inserts recurring rule, deletes original transaction, and returns no error", async () => {
    const result = await makeTransactionRecurring(TX_ONE, {
      accountId: ACC1,
      label: "Rent",
      amount: -500,
      startDate: "2026-01-01",
      frequency: "monthly",
    });
    expect(result.error).toBeNull();
    expect(mockMrRuleInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Rent",
        amount: -500,
        frequency: "monthly",
        start_date: "2026-01-01",
        root_rule_id: null,
      }),
    );
    expect(mockMrTxDelete).toHaveBeenCalled();
  });

  it("rolls back recurring rule when transaction delete fails", async () => {
    mockMrTxDeleteEq1.mockResolvedValueOnce({
      error: { message: "tx delete fail" },
    });
    const result = await makeTransactionRecurring(TX_ONE, {
      accountId: ACC1,
      label: "Rent",
      amount: -500,
      startDate: "2026-01-01",
      frequency: "monthly",
    });
    expect(result.error).not.toBeNull();
    expect(mockMrRuleDelete).toHaveBeenCalled();
    expect(mockMrRuleDeleteEq1).toHaveBeenCalledWith("id", RULE_FOR_MR);
    expect(mockMrRuleDeleteEq2).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("returns validation error for invalid transaction UUID without touching DB", async () => {
    const result = await makeTransactionRecurring("not-a-uuid", {
      accountId: ACC1,
      label: "Rent",
      amount: -500,
      startDate: "2026-01-01",
      frequency: "monthly",
    });
    expect(result.error).not.toBeNull();
    expect(mockMrRuleInsert).not.toHaveBeenCalled();
    expect(mockMrTxDelete).not.toHaveBeenCalled();
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
    const result = await upsertModifiedRecurringException(R1, "2025-03-01", {
      label: "Adjusted",
      amount: -99.5,
    });
    expect(result.error).toBeNull();
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        rule_id: R1,
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
    const result = await upsertModifiedRecurringException(R1, "2025-03-01", {
      label: "Adjusted",
      amount: -10,
      category_id: CAT_X,
    });
    expect(result.error).toBeNull();
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        rule_id: R1,
        exception_date: "2025-03-01",
        type: "modified",
        modified_amount: -10,
        modified_label: "Adjusted",
        category_id: CAT_X,
      },
      { onConflict: "rule_id,exception_date" },
    );
  });

  it("returns error when upsert fails", async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: "DB error" } });
    const result = await upsertModifiedRecurringException(R1, "2025-03-01", {
      label: "Adjusted",
      amount: -10,
    });
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
    const result = await skipRecurringOccurrence(R1, "2025-02-15");
    expect(result.error).toBeNull();
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        rule_id: R1,
        exception_date: "2025-02-15",
        type: "skip",
      },
      { onConflict: "rule_id,exception_date" },
    );
  });

  it("returns error when upsert fails", async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: "DB error" } });
    const result = await skipRecurringOccurrence(R1, "2025-02-15");
    expect(result.error).not.toBeNull();
  });
});

describe("moveRecurringOccurrence", () => {
  const mockTxSingle = vi.fn();
  const mockTxSelect = vi.fn(() => ({ single: mockTxSingle }));
  const mockTxInsert = vi.fn(() => ({ select: mockTxSelect }));
  const mockTxDeleteEq2 = vi.fn();
  const mockTxDeleteEq1 = vi.fn(() => ({ eq: mockTxDeleteEq2 }));
  const mockTxDelete = vi.fn(() => ({ eq: mockTxDeleteEq1 }));

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ error: null });
    mockTxSingle.mockResolvedValue({
      data: { id: TX_NEW },
      error: null,
    });
    mockTxDeleteEq2.mockResolvedValue({ error: null });
    mockTxDeleteEq1.mockReturnValue({ eq: mockTxDeleteEq2 });
    mockTxDelete.mockReturnValue({ eq: mockTxDeleteEq1 });
    fromTableHandler = (table: string) => {
      if (table === "transactions") {
        return { insert: mockTxInsert, delete: mockTxDelete };
      }
      if (table === "recurring_exceptions") {
        return { upsert: mockUpsert };
      }
      return {};
    };
  });

  it("when date unchanged calls upsert modified only, not insert or skip path on transactions", async () => {
    const result = await moveRecurringOccurrence({
      ruleId: R1,
      originalOccurrenceDate: "2025-03-01",
      targetDate: "2025-03-01",
      accountId: ACC1,
      label: "Adjusted",
      amount: -10,
      category_id: CAT_X,
    });
    expect(result.error).toBeNull();
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        rule_id: R1,
        exception_date: "2025-03-01",
        type: "modified",
        modified_label: "Adjusted",
        modified_amount: -10,
        category_id: CAT_X,
      }),
      { onConflict: "rule_id,exception_date" },
    );
    expect(mockTxInsert).not.toHaveBeenCalled();
  });

  it("when date changed inserts transaction then skips occurrence", async () => {
    const result = await moveRecurringOccurrence({
      ruleId: R1,
      originalOccurrenceDate: "2025-03-01",
      targetDate: "2025-03-05",
      accountId: ACC1,
      label: "Moved",
      amount: -20,
      category_id: null,
    });
    expect(result.error).toBeNull();
    expect(mockTxInsert).toHaveBeenCalled();
    expect(mockTxSelect).toHaveBeenCalledWith("id");
    expect(mockTxSingle).toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        rule_id: R1,
        exception_date: "2025-03-01",
        type: "skip",
      },
      { onConflict: "rule_id,exception_date" },
    );
    expect(mockTxDelete).not.toHaveBeenCalled();
  });

  it("when date changed and skip fails rolls back by deleting new transaction", async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: "skip failed" } });
    const result = await moveRecurringOccurrence({
      ruleId: R1,
      originalOccurrenceDate: "2025-03-01",
      targetDate: "2025-03-05",
      accountId: ACC1,
      label: "Moved",
      amount: -20,
    });
    expect(result.error?.message).toBe("skip failed");
    expect(mockTxDeleteEq1).toHaveBeenCalledWith("id", TX_NEW);
  });

  it("when date changed and insert fails returns error without calling skip", async () => {
    mockTxSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "insert failed" },
    });
    const result = await moveRecurringOccurrence({
      ruleId: R1,
      originalOccurrenceDate: "2025-03-01",
      targetDate: "2025-03-05",
      accountId: ACC1,
      label: "Moved",
      amount: -20,
    });
    expect(result.error?.message).toBe("insert failed");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("when date changed and accountId is blank returns error without touching DB", async () => {
    const result = await moveRecurringOccurrence({
      ruleId: R1,
      originalOccurrenceDate: "2025-03-01",
      targetDate: "2025-03-05",
      accountId: "   ",
      label: "Moved",
      amount: -20,
    });
    expect(result.error?.message).toMatch(/account/i);
    expect(mockTxInsert).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("endRecurringRuleFuture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq1.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq1 });
    fromTableHandler = (table: string) => {
      if (table === "recurring_rules") {
        return { update: mockUpdate };
      }
      return {};
    };
  });

  it("updates recurring_rules with end_date day before occurrence and filters by id", async () => {
    const result = await endRecurringRuleFuture(R1, "2025-03-15");
    expect(result.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({ end_date: "2025-03-14" });
    expect(mockEq1).toHaveBeenCalledWith("id", R1);
  });

  it("returns error when update fails", async () => {
    mockEq1.mockResolvedValueOnce({ error: { message: "DB error" } });
    const result = await endRecurringRuleFuture(R1, "2025-03-15");
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

  it("inserts category with user_id, account_id, name, icon, type", async () => {
    const result = await createCategory({
      accountId: ACC1,
      name: "Groceries",
      icon: "ShoppingCart",
      type: "expense",
    });
    expect(result.error).toBeNull();
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: "user-1",
      account_id: ACC1,
      name: "Groceries",
      icon: "ShoppingCart",
      type: "expense",
    });
  });

  it("returns error when insert fails", async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: "DB error" } });
    const result = await createCategory({
      accountId: ACC1,
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
    mockEq1.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq1 });
    fromTableHandler = (table: string) => {
      if (table === "categories") {
        return { update: mockUpdate };
      }
      return {};
    };
  });

  it("updates category with payload and filters by id", async () => {
    const result = await updateCategory(CAT1, {
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
    expect(mockEq1).toHaveBeenCalledWith("id", CAT1);
  });

  it("returns error when update fails", async () => {
    mockEq1.mockResolvedValueOnce({ error: { message: "DB error" } });
    const result = await updateCategory(CAT1, { name: "Food" });
    expect(result.error).not.toBeNull();
  });
});

describe("deleteCategory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteEq1.mockResolvedValue({ error: null });
    mockDelete.mockReturnValue({ eq: mockDeleteEq1 });
    fromTableHandler = (table: string) => {
      if (table === "categories") {
        return { delete: mockDelete };
      }
      return {};
    };
  });

  it("deletes category and filters by id", async () => {
    const result = await deleteCategory(CAT1);
    expect(result.error).toBeNull();
    expect(mockDelete).toHaveBeenCalled();
    expect(mockDeleteEq1).toHaveBeenCalledWith("id", CAT1);
  });

  it("returns error when delete fails", async () => {
    mockDeleteEq1.mockResolvedValueOnce({ error: { message: "DB error" } });
    const result = await deleteCategory(CAT1);
    expect(result.error).not.toBeNull();
  });
});

describe("mutation payload validation (Zod)", () => {
  it("deleteTransaction returns { error } with message for invalid id", async () => {
    const result = await deleteTransaction("not-a-uuid");
    expect(result.error).not.toBeNull();
    expect(result.error?.message.length).toBeGreaterThan(0);
    expect(result.error?.message).toMatch(/invalid|uuid/i);
  });

  it("createTransaction returns { data: null, error } for invalid date", async () => {
    const result = await createTransaction({
      accountId: ACC1,
      label: "Test",
      amount: -10,
      date: "03-15-2025",
    });
    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error?.message).toMatch(/date/i);
  });

  it("skipRecurringOccurrence returns { error } for invalid rule id", async () => {
    const result = await skipRecurringOccurrence("bad-id", "2025-03-01");
    expect(result.error).not.toBeNull();
    expect(result.error?.message).toMatch(/ruleId|uuid/i);
  });

  it("createCategory returns { error } for empty name after trim", async () => {
    const result = await createCategory({
      accountId: ACC1,
      name: "   ",
      icon: "ShoppingCart",
      type: "expense",
    });
    expect(result.error).not.toBeNull();
    expect(result.error?.message).toMatch(/name/i);
  });
});

describe("validation - mutual exclusivity", () => {
  it("createRecurringRulePayloadSchema rejects when both endDate and recurrenceCount are set", () => {
    const result = createRecurringRulePayloadSchema.safeParse({
      accountId: ACC1,
      label: "Rent",
      amount: -500,
      frequency: "monthly",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      recurrenceCount: 12,
    });
    expect(result.success).toBe(false);
  });

  it("createRecurringRulePayloadSchema accepts when only endDate is set", () => {
    const result = createRecurringRulePayloadSchema.safeParse({
      accountId: ACC1,
      label: "Rent",
      amount: -500,
      frequency: "monthly",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    expect(result.success).toBe(true);
  });

  it("createRecurringRulePayloadSchema accepts when only recurrenceCount is set", () => {
    const result = createRecurringRulePayloadSchema.safeParse({
      accountId: ACC1,
      label: "Rent",
      amount: -500,
      frequency: "monthly",
      startDate: "2026-01-01",
      recurrenceCount: 12,
    });
    expect(result.success).toBe(true);
  });

  it("recurringSegmentPayloadSchema rejects when both endDate and recurrenceCount are set", () => {
    const result = recurringSegmentPayloadSchema.safeParse({
      label: "Rent",
      amount: -500,
      frequency: "monthly",
      endDate: "2026-12-31",
      recurrenceCount: 12,
    });
    expect(result.success).toBe(false);
  });

  it("recurringSegmentPayloadSchema accepts when only endDate is set", () => {
    const result = recurringSegmentPayloadSchema.safeParse({
      label: "Rent",
      amount: -500,
      frequency: "monthly",
      endDate: "2026-12-31",
    });
    expect(result.success).toBe(true);
  });

  it("recurringSegmentPayloadSchema accepts when only recurrenceCount is set", () => {
    const result = recurringSegmentPayloadSchema.safeParse({
      label: "Rent",
      amount: -500,
      frequency: "monthly",
      recurrenceCount: 12,
    });
    expect(result.success).toBe(true);
  });
});
