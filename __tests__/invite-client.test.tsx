// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InviteClient } from "@/app/invite/[token]/invite-client";

const mockPush = vi.fn();
const mockSignOut = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signOut: mockSignOut },
  }),
}));

vi.mock("@/lib/invite-actions", () => ({
  acceptInvitation: vi.fn(),
}));

describe("InviteClient", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockSignOut.mockReset();
    mockSignOut.mockResolvedValue({ error: null });
  });

  it("lets a wrong-email user sign out and return to the invite link", async () => {
    render(
      <InviteClient
        token="cccccccc-cccc-4ccc-8ccc-cccccccccccc"
        accountName={null}
        errorMessage="This invitation was sent to a different email address."
        errorCode="wrong-email"
        invitedEmail="invited@example.com"
        currentUserEmail="current@example.com"
      />,
    );

    expect(screen.getByText(/in\*\*\*@example\.com/i)).toBeInTheDocument();
    expect(screen.getByText(/current@example\.com/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /use another account/i }));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith(
        "/login?next=/invite/cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      );
    });
  });

  it("routes public invite users to login with prefilled email and preserved invite path", () => {
    render(
      <InviteClient
        token="cccccccc-cccc-4ccc-8ccc-cccccccccccc"
        mode="public"
        accountName="Family Budget"
        errorMessage={null}
        invitedEmail="invited@example.com"
        expiresAt="2026-05-12T12:00:00.000Z"
      />,
    );

    expect(screen.getByText("Family Budget")).toBeInTheDocument();
    expect(screen.getByText(/in\*\*\*@example\.com/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(mockPush).toHaveBeenCalledWith(
      "/login?email=invited%40example.com&next=%2Finvite%2Fcccccccc-cccc-4ccc-8ccc-cccccccccccc",
    );
  });
});
