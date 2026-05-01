import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  applyRecurringEditFromDate,
  createAccount,
  createInvitation,
  createRecurringRule,
  createTransaction,
  deleteCategory,
  deleteBudget,
  deleteTransaction,
  leaveAccount,
  makeTransactionRecurring,
  removeMember,
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

const ACC_SHARE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER_UID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const INV_TOKEN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "22222222-2222-4222-8222-222222222222";
const R_SEG2 = "33333333-3333-4333-8333-333333333333";
const RA = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const CAT1 = "44444444-4444-4444-8444-444444444444";
const CAT_X = "55555555-5555-5555-8555-555555555555";
const ACC1 = "66666666-6666-4666-8666-666666666666";
const ACC123 = "77777777-7777-4777-8777-777777777777";
const TX_NEW = "88888888-8888-4888-8888-888888888888";
const ACC_NEW = "99999999-9999-4999-8999-999999999999";

const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });

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
    rpc: mockRpc,
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

  function txAccountChain(accountId: string | null) {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: accountId ? { account_id: accountId } : null,
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    return { select: vi.fn().mockReturnValue({ eq }), delete: mockMrTxDelete };
  }

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
        return txAccountChain(ACC1);
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

  it("returns error when transaction belongs to a different account (cross-account guard)", async () => {
    fromTableHandler = (table: string) => {
      if (table === "recurring_rules") {
        return { insert: mockMrRuleInsert, delete: mockMrRuleDelete };
      }
      if (table === "transactions") {
        return txAccountChain(ACC123);
      }
      return {};
    };
    const result = await makeTransactionRecurring(TX_ONE, {
      accountId: ACC1,
      label: "Rent",
      amount: -500,
      startDate: "2026-01-01",
      frequency: "monthly",
    });
    expect(result.error).not.toBeNull();
    expect(mockMrRuleInsert).not.toHaveBeenCalled();
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

describe("createAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: ACC_NEW, error: null });
  });

  it("calls create_account_with_member RPC with name and starting_balance (no p_user_id — RPC uses auth.uid())", async () => {
    const result = await createAccount({
      name: "Vacation",
      starting_balance: 100,
    });
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: ACC_NEW });
    expect(mockRpc).toHaveBeenCalledWith("create_account_with_member", {
      p_name: "Vacation",
      p_starting_balance: 100,
    });
  });

  it("returns error when RPC fails", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "duplicate key" },
    });
    const result = await createAccount({
      name: "Vacation",
      starting_balance: 0,
    });
    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it("returns error when RPC returns null id", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    const result = await createAccount({
      name: "Vacation",
      starting_balance: 0,
    });
    expect(result.data).toBeNull();
    expect(result.error?.message).toMatch(/no id/i);
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

  it("createCategory returns { error } when accountId is invalid", async () => {
    const result = await createCategory({
      accountId: "not-a-uuid",
      name: "Groceries",
      icon: "ShoppingCart",
      type: "expense",
    });
    expect(result.error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Budget-sharing mutations
// ---------------------------------------------------------------------------

describe("createInvitation", () => {
  // Helpers that build the chained mock for the accounts owner-check query:
  //   .select("user_id").eq("id",...).eq("user_id",...).maybeSingle()
  function ownerCheckChain(data: { user_id: string } | null) {
    const maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
    const eq2 = vi.fn().mockReturnValue({ maybeSingle });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    return { select: vi.fn().mockReturnValue({ eq: eq1 }) };
  }

  // Existing-invite check chain:
  //   .select("id").eq("account_id",...).eq("invited_email",...).is(...).gt(...).maybeSingle()
  function existingInviteChain(found: boolean) {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: found ? { id: "existing-invite-id" } : null,
      error: null,
    });
    const gt = vi.fn().mockReturnValue({ maybeSingle });
    const is = vi.fn().mockReturnValue({ gt });
    const eq2 = vi.fn().mockReturnValue({ is });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    return { select: vi.fn().mockReturnValue({ eq: eq1 }) };
  }

  // Expired-invite cleanup chain:
  //   .delete().eq("account_id",...).eq("invited_email",...).is(...).lt(...)
  function expiredInviteCleanupChain(dbError: { message: string } | null = null) {
    const lt = vi.fn().mockResolvedValue({ error: dbError });
    const is = vi.fn().mockReturnValue({ lt });
    const eq2 = vi.fn().mockReturnValue({ is });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    return { delete: vi.fn().mockReturnValue({ eq: eq1 }) };
  }

  // Insert chain: .insert({}).select("token").single()
  function insertChain(
    result: { data: { token: string } | null; error: { code?: string; message: string } | null },
  ) {
    const single = vi.fn().mockResolvedValue(result);
    const sel = vi.fn().mockReturnValue({ single });
    return { insert: vi.fn().mockReturnValue({ select: sel }) };
  }

  beforeEach(() => vi.clearAllMocks());

  it("rejects when caller is not the account owner", async () => {
    fromTableHandler = (table) => {
      if (table === "accounts") return ownerCheckChain(null);
      return {};
    };
    const { error } = await createInvitation(ACC_SHARE, "guest@example.com");
    expect(error?.message).toMatch(/owner/i);
  });

  it("rejects self-invite without hitting the DB", async () => {
    // user mock returns id "user-1" with email "user-1@example.com"
    const mockGetUserWithEmail = vi.fn().mockResolvedValue({
      data: { user: { id: "user-1", email: "user-1@example.com" } },
    });
    vi.mocked(
      (await import("@/lib/supabase/client")).createClient,
    ).mockReturnValueOnce({
      auth: { getUser: mockGetUserWithEmail },
      from: vi.fn((table: string) => fromTableHandler(table)),
      rpc: mockRpc,
    } as unknown as ReturnType<typeof import("@/lib/supabase/client").createClient>);

    const { error } = await createInvitation(ACC_SHARE, "user-1@example.com");
    expect(error?.message).toMatch(/yourself/i);
  });

  it("rejects when a pending invite already exists for that email", async () => {
    let inviteCallCount = 0;
    fromTableHandler = (table) => {
      if (table === "accounts") return ownerCheckChain({ user_id: "user-1" });
      if (table === "budget_invitations") {
        inviteCallCount++;
        if (inviteCallCount === 1) return expiredInviteCleanupChain();
        return existingInviteChain(true);
      }
      return {};
    };
    const { error } = await createInvitation(ACC_SHARE, "guest@example.com");
    expect(error?.message).toMatch(/pending/i);
  });

  it("returns cleanup error when expired pending invite cleanup fails", async () => {
    fromTableHandler = (table) => {
      if (table === "accounts") return ownerCheckChain({ user_id: "user-1" });
      if (table === "budget_invitations") {
        return expiredInviteCleanupChain({ message: "cleanup failed" });
      }
      return {};
    };
    const { error } = await createInvitation(ACC_SHARE, "guest@example.com");
    expect(error?.message).toBe("cleanup failed");
  });

  it("creates invite and returns token on success", async () => {
    let inviteCallCount = 0;
    fromTableHandler = (table) => {
      if (table === "accounts") return ownerCheckChain({ user_id: "user-1" });
      if (table === "budget_invitations") {
        inviteCallCount++;
        if (inviteCallCount === 1) return expiredInviteCleanupChain();
        if (inviteCallCount === 2) return existingInviteChain(false);
        return insertChain({ data: { token: INV_TOKEN }, error: null });
      }
      return {};
    };
    const { data, error } = await createInvitation(ACC_SHARE, "guest@example.com");
    expect(error).toBeNull();
    expect(data?.token).toBe(INV_TOKEN);
  });

  it("normalises email to lowercase before storing", async () => {
    const captured: { row: Record<string, unknown> | null } = { row: null };
    let inviteCallCount = 0;
    fromTableHandler = (table) => {
      if (table === "accounts") return ownerCheckChain({ user_id: "user-1" });
      if (table === "budget_invitations") {
        inviteCallCount++;
        if (inviteCallCount === 1) return expiredInviteCleanupChain();
        if (inviteCallCount === 2) return existingInviteChain(false);
        const single = vi.fn().mockResolvedValue({ data: { token: INV_TOKEN }, error: null });
        const sel = vi.fn().mockReturnValue({ single });
        const ins = vi.fn().mockImplementation((row: Record<string, unknown>) => {
          captured.row = row;
          return { select: sel };
        });
        return { insert: ins };
      }
      return {};
    };
    await createInvitation(ACC_SHARE, "Guest@Example.COM");
    expect(captured.row?.invited_email).toBe("guest@example.com");
  });

  it("returns 'already pending' for DB unique constraint violation (23505)", async () => {
    let inviteCallCount = 0;
    fromTableHandler = (table) => {
      if (table === "accounts") return ownerCheckChain({ user_id: "user-1" });
      if (table === "budget_invitations") {
        inviteCallCount++;
        if (inviteCallCount === 1) return expiredInviteCleanupChain();
        if (inviteCallCount === 2) return existingInviteChain(false);
        return insertChain({ data: null, error: { code: "23505", message: "unique" } });
      }
      return {};
    };
    const { error } = await createInvitation(ACC_SHARE, "guest@example.com");
    expect(error?.message).toMatch(/pending/i);
  });

  it("returns validation error for invalid accountId", async () => {
    const { error } = await createInvitation("not-a-uuid", "guest@example.com");
    expect(error?.message).toMatch(/invalid|uuid/i);
  });
});

describe("removeMember", () => {
  // Delete chain: .delete().eq("account_id",...).eq("user_id",...).neq("role","owner")
  function removeChain(dbError: { message: string } | null = null) {
    const neq = vi.fn().mockResolvedValue({ error: dbError });
    const eq2 = vi.fn().mockReturnValue({ neq });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const del = vi.fn().mockReturnValue({ eq: eq1 });
    return { delete: del, neq };
  }

  beforeEach(() => vi.clearAllMocks());

  it("owner can remove a member — deletes with account_id, user_id, neq(owner) guard", async () => {
    const chain = removeChain();
    fromTableHandler = (table) => {
      if (table === "account_members") return chain;
      return {};
    };
    const { error } = await removeMember(ACC_SHARE, MEMBER_UID);
    expect(error).toBeNull();
    expect(chain.neq).toHaveBeenCalledWith("role", "owner");
  });

  it("rejects when caller tries to remove themselves (use leaveAccount)", async () => {
    // Override the user mock to return a valid UUID so the UUID check passes
    // and we reach the self-removal guard.
    const { createClient } = await import("@/lib/supabase/client");
    vi.mocked(createClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: MEMBER_UID } },
        }),
      },
      from: vi.fn((table: string) => fromTableHandler(table)),
      rpc: mockRpc,
    } as unknown as ReturnType<typeof createClient>);

    const { error } = await removeMember(ACC_SHARE, MEMBER_UID);
    expect(error?.message).toMatch(/leave/i);
  });

  it("returns error when DB delete fails", async () => {
    const chain = removeChain({ message: "permission denied" });
    fromTableHandler = (table) => {
      if (table === "account_members") return chain;
      return {};
    };
    const { error } = await removeMember(ACC_SHARE, MEMBER_UID);
    expect(error?.message).toBe("permission denied");
  });
});

describe("leaveAccount", () => {
  // Owner-check chain: .select("user_id").eq("id",...).maybeSingle()
  function ownerCheckChain(isOwner: boolean) {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: isOwner ? { user_id: "user-1" } : { user_id: "other-user" },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    return { select: vi.fn().mockReturnValue({ eq }) };
  }

  // Delete chain: .delete().eq("account_id",...).eq("user_id",...)
  function leaveDeleteChain(dbError: { message: string } | null = null) {
    const eq2 = vi.fn().mockResolvedValue({ error: dbError });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const del = vi.fn().mockReturnValue({ eq: eq1 });
    return { delete: del };
  }

  beforeEach(() => vi.clearAllMocks());

  it("member can leave — deletes own account_members row", async () => {
    fromTableHandler = (table) => {
      if (table === "accounts") return ownerCheckChain(false);
      if (table === "account_members") return leaveDeleteChain();
      return {};
    };
    const { error } = await leaveAccount(ACC_SHARE);
    expect(error).toBeNull();
  });

  it("owner is blocked from leaving", async () => {
    fromTableHandler = (table) => {
      if (table === "accounts") return ownerCheckChain(true);
      return {};
    };
    const { error } = await leaveAccount(ACC_SHARE);
    expect(error?.message).toMatch(/owner|delete/i);
  });

  it("returns error when account is not found (null guard)", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    fromTableHandler = (table) => {
      if (table === "accounts") return { select: vi.fn().mockReturnValue({ eq }) };
      return {};
    };
    const { error } = await leaveAccount(ACC_SHARE);
    expect(error?.message).toMatch(/not found/i);
  });

  it("returns validation error for invalid accountId", async () => {
    const { error } = await leaveAccount("not-a-uuid");
    expect(error?.message).toMatch(/invalid|uuid/i);
  });
});

describe("deleteBudget", () => {
  // Member-guard chain:
  //   .select("id").eq("account_id",...).neq("role","owner").limit(1).maybeSingle()
  function memberGuardChain(hasMembers: boolean) {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: hasMembers ? { id: "member-row-id" } : null,
      error: null,
    });
    const limit = vi.fn().mockReturnValue({ maybeSingle });
    const neq = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ neq });
    return { select: vi.fn().mockReturnValue({ eq }) };
  }

  // Account-delete chain: .delete().eq("id",...).eq("user_id",...)
  function accountDeleteChain(dbError: { message: string } | null = null) {
    const eq2 = vi.fn().mockResolvedValue({ error: dbError });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const del = vi.fn().mockReturnValue({ eq: eq1 });
    return { delete: del };
  }

  beforeEach(() => vi.clearAllMocks());

  it("is blocked when non-owner members exist", async () => {
    fromTableHandler = (table) => {
      if (table === "account_members") return memberGuardChain(true);
      return {};
    };
    const { error } = await deleteBudget(ACC_SHARE);
    expect(error?.message).toMatch(/remove all members/i);
  });

  it("succeeds when no non-owner members exist", async () => {
    fromTableHandler = (table) => {
      if (table === "account_members") return memberGuardChain(false);
      if (table === "accounts") return accountDeleteChain();
      return {};
    };
    const { error } = await deleteBudget(ACC_SHARE);
    expect(error).toBeNull();
  });

  it("returns validation error for invalid id", async () => {
    const { error } = await deleteBudget("not-a-uuid");
    expect(error?.message).toMatch(/invalid|uuid/i);
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
