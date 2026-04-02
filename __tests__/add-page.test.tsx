// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AddPage from "@/app/(app)/add/page";
import * as mutations from "@/lib/transactions-mutations";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), back: vi.fn() })),
  useSearchParams: vi.fn(() => ({ get: vi.fn().mockReturnValue(null) })),
}));

vi.mock("swr", () => ({
  default: vi.fn().mockReturnValue({ data: [] }),
  mutate: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: "account-1" },
            error: null,
          }),
        }),
      }),
    }),
  })),
}));

vi.mock("@/lib/transactions-mutations", () => ({
  createTransaction: vi.fn(),
  createRecurringRule: vi.fn(),
  updateTransaction: vi.fn(),
}));

describe("AddPage amount validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows inline error and does not call mutations when amount is "."', async () => {
    render(<AddPage />);

    // Wait for the async account load to complete (enables the submit button)
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /add expense/i }),
      ).not.toBeDisabled();
    });

    // Fill the required label field so HTML constraint validation passes
    fireEvent.change(screen.getByPlaceholderText("e.g. Grocery Store"), {
      target: { value: "Test" },
    });

    // Set amount to "." — passes CurrencyInput's onChange pattern but is
    // semantically invalid (parseFloat(".") === NaN)
    fireEvent.change(screen.getByPlaceholderText("0.00"), {
      target: { value: "." },
    });

    fireEvent.click(screen.getByRole("button", { name: /add expense/i }));

    expect(
      await screen.findByText("Enter a valid amount"),
    ).toBeInTheDocument();
    expect(mutations.createTransaction).not.toHaveBeenCalled();
    expect(mutations.createRecurringRule).not.toHaveBeenCalled();
  });
});
