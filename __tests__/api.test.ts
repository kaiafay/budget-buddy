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

  it("fetchAccounts reads memberships and nested accounts (RLS on account_members)", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          role: "owner",
          accounts: {
            id: ACCOUNT_ID,
            name: "Main",
            starting_balance: 0,
            user_id: "user-1",
          },
        },
      ],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });

    mockFrom.mockImplementation((table: string) => {
      if (table === "account_members") {
        return { select };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await fetchAccounts();

    expect(result).toEqual([
      {
        id: ACCOUNT_ID,
        name: "Main",
        starting_balance: 0,
        user_id: "user-1",
        role: "owner",
      },
    ]);
    expect(mockFrom).toHaveBeenCalledWith("account_members");
    expect(select).toHaveBeenCalledWith(
      "role, accounts(id, name, starting_balance, user_id, created_at)",
    );
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(order).toHaveBeenCalledWith("created_at", {
      referencedTable: "accounts",
      ascending: true,
    });
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
