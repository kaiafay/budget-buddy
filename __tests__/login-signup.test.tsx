// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";

const mockPush = vi.fn();
const mockSignUp = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signUp: mockSignUp,
      signInWithPassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
  }),
}));

vi.mock("@/components/auth-card", () => ({
  AuthCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("LoginPage signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignUp.mockResolvedValue({
      data: { user: { identities: [{}] } },
      error: null,
    });
    window.history.replaceState({}, "", "/login");
  });

  it("sends normal signup confirmations to the PWA confirmation page", async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));
    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: "Ada" },
    });
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: "Lovelace" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: "ada@example.com",
        password: "password1",
        options: {
          emailRedirectTo: "http://localhost:3000/auth/confirm",
          data: {
            given_name: "Ada",
            family_name: "Lovelace",
            skip_default_budget: false,
          },
        },
      });
    });
  });

  it("preserves invite redirects and marks invite signups to skip personal budget creation", async () => {
    window.history.replaceState(
      {},
      "",
      "/login?next=/invite/cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    );

    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));
    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: "Grace" },
    });
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: "Hopper" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "grace@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            emailRedirectTo:
              "http://localhost:3000/auth/callback?next=%2Finvite%2Fcccccccc-cccc-4ccc-8ccc-cccccccccccc",
            data: expect.objectContaining({
              skip_default_budget: true,
            }),
          }),
        }),
      );
    });
  });
});
