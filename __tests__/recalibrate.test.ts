import { describe, it, expect, vi, beforeEach } from "vitest";
import { recalibrateBalance } from "@/lib/transactions-mutations";

const ACC1 = "66666666-6666-4666-8666-666666666666";
const TX_NEW = "88888888-8888-4888-8888-888888888888";

const mockTxSingle = vi.fn();
const mockTxSelect = vi.fn(() => ({ single: mockTxSingle }));
const mockTxInsert = vi.fn(() => ({ select: mockTxSelect }));

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

describe("recalibrateBalance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTxSingle.mockResolvedValue({ data: { id: TX_NEW }, error: null });
    fromTableHandler = (table: string) => {
      if (table === "transactions") {
        return { insert: mockTxInsert };
      }
      return {};
    };
  });

  it("returns no error and does not insert when delta is zero", async () => {
    const result = await recalibrateBalance({
      accountId: ACC1,
      delta: 0,
      date: "2026-04-28",
    });
    expect(result.error).toBeNull();
    expect(mockTxInsert).not.toHaveBeenCalled();
  });

  it("inserts a positive adjustment transaction when delta is positive", async () => {
    const result = await recalibrateBalance({
      accountId: ACC1,
      delta: 500,
      date: "2026-04-28",
    });
    expect(result.error).toBeNull();
    expect(mockTxInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Balance adjustment",
        amount: 500,
        date: "2026-04-28",
        user_id: "user-1",
        account_id: ACC1,
      }),
    );
  });

  it("inserts a negative adjustment transaction when delta is negative", async () => {
    const result = await recalibrateBalance({
      accountId: ACC1,
      delta: -200,
      date: "2026-04-28",
    });
    expect(result.error).toBeNull();
    expect(mockTxInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: -200,
        label: "Balance adjustment",
      }),
    );
  });

  it("returns validation error and does not insert when delta exceeds $1,000,000", async () => {
    const result = await recalibrateBalance({
      accountId: ACC1,
      delta: 2_000_000,
      date: "2026-04-28",
    });
    expect(result.error).not.toBeNull();
    expect(mockTxInsert).not.toHaveBeenCalled();
  });

  it("returns validation error and does not insert when delta is below -$1,000,000", async () => {
    const result = await recalibrateBalance({
      accountId: ACC1,
      delta: -2_000_000,
      date: "2026-04-28",
    });
    expect(result.error).not.toBeNull();
    expect(mockTxInsert).not.toHaveBeenCalled();
  });

  it("returns validation error and does not insert when accountId is not a valid UUID", async () => {
    const result = await recalibrateBalance({
      accountId: "not-a-uuid",
      delta: 100,
      date: "2026-04-28",
    });
    expect(result.error).not.toBeNull();
    expect(result.error?.message).toMatch(/accountId|uuid/i);
    expect(mockTxInsert).not.toHaveBeenCalled();
  });

  it("returns validation error and does not insert when date is not ISO format", async () => {
    const result = await recalibrateBalance({
      accountId: ACC1,
      delta: 100,
      date: "04-28-2026",
    });
    expect(result.error).not.toBeNull();
    expect(mockTxInsert).not.toHaveBeenCalled();
  });

  it("surfaces DB error when transaction insert fails", async () => {
    mockTxSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "insert failed" },
    });
    const result = await recalibrateBalance({
      accountId: ACC1,
      delta: 100,
      date: "2026-04-28",
    });
    expect(result.error).not.toBeNull();
    expect(result.error?.message).toBe("insert failed");
  });
});
