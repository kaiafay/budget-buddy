import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

import { fetchAccounts, fetchCategories } from "@/lib/api";

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";

describe("api fetcher contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("fetchAccounts relies on RLS and does not add a user_id predicate", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{ id: ACCOUNT_ID, name: "Main", starting_balance: 0 }],
      error: null,
    });
    const select = vi.fn().mockReturnValue({ order });

    mockFrom.mockImplementation((table: string) => {
      if (table === "accounts") {
        return { select };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await fetchAccounts();

    expect(result).toEqual([
      { id: ACCOUNT_ID, name: "Main", starting_balance: 0 },
    ]);
    expect(mockFrom).toHaveBeenCalledWith("accounts");
    expect(select).toHaveBeenCalledWith("id, name, starting_balance");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("fetchCategories(accountId) scopes by account_id", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Groceries",
          icon: "ShoppingCart",
          type: "expense",
          account_id: ACCOUNT_ID,
        },
      ],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });

    mockFrom.mockImplementation((table: string) => {
      if (table === "categories") {
        return { select };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    await fetchCategories(ACCOUNT_ID);

    expect(mockFrom).toHaveBeenCalledWith("categories");
    expect(select).toHaveBeenCalledWith("id, name, icon, type, account_id");
    expect(eq).toHaveBeenCalledWith("account_id", ACCOUNT_ID);
    expect(order).toHaveBeenCalledWith("name", { ascending: true });
  });
});
