// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useEditLoader } from "@/hooks/use-edit-loader";

const TX_ID = "11111111-1111-4111-8111-111111111111";
const RULE_ID = "22222222-2222-4222-8222-222222222222";
const EXPECTED_ACC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ACC = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const mockFetchTransaction = vi.fn();
const mockFetchRecurringRule = vi.fn();
const mockFetchNextChainSegment = vi.fn();

vi.mock("@/lib/api", () => ({
  fetchTransaction: (...args: unknown[]) => mockFetchTransaction(...args),
  fetchRecurringRule: (...args: unknown[]) => mockFetchRecurringRule(...args),
  fetchNextChainSegment: (...args: unknown[]) => mockFetchNextChainSegment(...args),
}));

function makeSetters() {
  return {
    setLabel: vi.fn(),
    setAmount: vi.fn(),
    setType: vi.fn(),
    setCategoryId: vi.fn(),
    setDate: vi.fn(),
    setRecurring: vi.fn(),
    setFrequency: vi.fn(),
    setScopeOccurrenceDate: vi.fn(),
    setScopeNextSegmentDate: vi.fn(),
    setScopeNextSegmentLoading: vi.fn(),
    setEndCondition: vi.fn(),
    setEndDate: vi.fn(),
  };
}

describe("useEditLoader account guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchNextChainSegment.mockResolvedValue(null);
  });

  it("surfaces error when edited transaction belongs to a different account", async () => {
    const setters = makeSetters();
    mockFetchTransaction.mockResolvedValue({
      id: TX_ID,
      label: "Test",
      amount: -12,
      date: "2026-01-01",
      category_id: null,
      account_id: OTHER_ACC,
    });

    const { result } = renderHook(() =>
      useEditLoader(TX_ID, null, null, setters, false, EXPECTED_ACC),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("This transaction belongs to a different budget.");
    expect(setters.setLabel).not.toHaveBeenCalled();
  });

  it("surfaces error when edited recurring rule belongs to a different account", async () => {
    const setters = makeSetters();
    mockFetchRecurringRule.mockResolvedValue({
      id: RULE_ID,
      label: "Rent",
      amount: -900,
      frequency: "monthly",
      start_date: "2026-01-01",
      account_id: OTHER_ACC,
      category_id: null,
    });

    const { result } = renderHook(() =>
      useEditLoader(null, RULE_ID, "2026-01-20", setters, false, EXPECTED_ACC),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("This recurring rule belongs to a different budget.");
    expect(setters.setLabel).not.toHaveBeenCalled();
  });
});
