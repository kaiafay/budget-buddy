import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  updateRecurringRuleFromDate,
  skipRecurringOccurrence,
  endRecurringRuleFuture,
} from "@/lib/transactions-mutations";

const mockEq2 = vi.fn().mockResolvedValue({ error: null });
const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 });
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockUpsert = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { account_id: "acc-123" },
          error: null,
        }),
      }),
      update: mockUpdate,
      insert: mockInsert,
      upsert: mockUpsert,
    })),
  })),
}));

describe("updateRecurringRuleFromDate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq2.mockResolvedValue({ error: null });
    mockEq1.mockReturnValue({ eq: mockEq2 });
    mockUpdate.mockReturnValue({ eq: mockEq1 });
    mockInsert.mockResolvedValue({ error: null });
    mockUpsert.mockResolvedValue({ error: null });
  });

  it("calls update with end_date set to day before occurrence and insert with new rule from occurrence date", async () => {
    const result = await updateRecurringRuleFromDate(
      "rule-1",
      "2025-02-15",
      {
        label: "New Rent",
        amount: -25,
        frequency: "monthly",
      },
    );

    expect(result.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({ end_date: "2025-02-14" });
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: "user-1",
      account_id: "acc-123",
      label: "New Rent",
      amount: -25,
      frequency: "monthly",
      start_date: "2025-02-15",
    });
  });

  it("preserves account_id from original rule in the new inserted rule", async () => {
    await updateRecurringRuleFromDate("rule-1", "2025-02-15", {
      label: "New Rent",
      amount: -25,
      frequency: "monthly",
    });
    const insertCall = mockInsert.mock.calls[0][0];
    expect(insertCall.account_id).toBe("acc-123");
  });

  it("returns error and does not call insert if update fails", async () => {
    mockEq2.mockResolvedValueOnce({ error: { message: "DB error" } });
    const result = await updateRecurringRuleFromDate("rule-1", "2025-02-15", {
      label: "New Rent",
      amount: -25,
      frequency: "monthly",
    });
    expect(result.error).not.toBeNull();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("skipRecurringOccurrence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ error: null });
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
