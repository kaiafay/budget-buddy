// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ActiveAccountProvider, useActiveAccount } from "@/components/active-account-provider";

const ACC1 = "11111111-1111-4111-8111-111111111111";
const ACC2 = "22222222-2222-4222-8222-222222222222";
const ACC3 = "33333333-3333-4333-8333-333333333333";

let currentUrlAccount: string | null = null;
const mockUseSWR = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === "account" ? currentUrlAccount : null),
  }),
}));

vi.mock("swr", () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

function Harness() {
  const { activeAccountId, setActiveAccount, isLoading, hasNoAccounts } =
    useActiveAccount();
  return (
    <div>
      <div data-testid="active-account">{activeAccountId ?? "none"}</div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="has-no-accounts">{String(hasNoAccounts)}</div>
      <button type="button" onClick={() => setActiveAccount(ACC3)}>
        set-unknown
      </button>
      <button type="button" onClick={() => setActiveAccount(ACC1)}>
        set-known
      </button>
    </div>
  );
}

describe("ActiveAccountProvider", () => {
  beforeEach(() => {
    currentUrlAccount = null;
    window.localStorage.clear();
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      data: [
        { id: ACC1, name: "Main", starting_balance: 0 },
        { id: ACC2, name: "Shared", starting_balance: 0 },
      ],
      isLoading: false,
      error: undefined,
    });
  });

  it("resolves URL account first and ignores setActiveAccount for unknown account ids", async () => {
    currentUrlAccount = ACC2;
    render(
      <ActiveAccountProvider>
        <Harness />
      </ActiveAccountProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    expect(screen.getByTestId("active-account").textContent).toBe(ACC2);
    expect(window.localStorage.getItem("budget-buddy:active-account")).toBe(ACC2);

    fireEvent.click(screen.getByRole("button", { name: "set-unknown" }));
    expect(screen.getByTestId("active-account").textContent).toBe(ACC2);

    fireEvent.click(screen.getByRole("button", { name: "set-known" }));
    expect(screen.getByTestId("active-account").textContent).toBe(ACC1);
  });

  it("falls back to localStorage when URL param is missing", async () => {
    window.localStorage.setItem("budget-buddy:active-account", ACC2);

    render(
      <ActiveAccountProvider>
        <Harness />
      </ActiveAccountProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    expect(screen.getByTestId("active-account").textContent).toBe(ACC2);
  });

  it("falls back to first account when localStorage value is stale", async () => {
    window.localStorage.setItem("budget-buddy:active-account", ACC3);

    render(
      <ActiveAccountProvider>
        <Harness />
      </ActiveAccountProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    expect(screen.getByTestId("active-account").textContent).toBe(ACC1);
    expect(window.localStorage.getItem("budget-buddy:active-account")).toBe(ACC1);
  });

  it("sets hasNoAccounts when account list is empty", async () => {
    mockUseSWR.mockReturnValue({
      data: [],
      isLoading: false,
      error: undefined,
    });

    render(
      <ActiveAccountProvider>
        <Harness />
      </ActiveAccountProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    expect(screen.getByTestId("active-account").textContent).toBe("none");
    expect(screen.getByTestId("has-no-accounts").textContent).toBe("true");
  });
});
