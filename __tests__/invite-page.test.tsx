import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";
import InvitePage from "@/app/invite/[token]/page";

const {
  mockCreateServerClient,
  mockCreateAdminClient,
  mockGetUser,
  mockAdminFrom,
  mockInviteClient,
} = vi.hoisted(() => ({
  mockCreateServerClient: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockGetUser: vi.fn(),
  mockAdminFrom: vi.fn(),
  mockInviteClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateServerClient,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateAdminClient,
}));

vi.mock("@/app/invite/[token]/invite-client", () => ({
  InviteClient: mockInviteClient,
}));

const TOKEN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

type InviteRow = {
  id: string;
  invited_email: string;
  expires_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  accounts: { name: string } | { name: string }[] | null;
};

function inviteRow(overrides: Partial<InviteRow> = {}): InviteRow {
  return {
    id: "invite-1",
    invited_email: "guest@example.com",
    expires_at: "2999-01-01T00:00:00.000Z",
    accepted_at: null,
    declined_at: null,
    accounts: { name: "Family Budget" },
    ...overrides,
  };
}

function adminInviteQuery(data: InviteRow | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  return { select };
}

async function renderInvitePage(token = TOKEN) {
  const element = await InvitePage({ params: Promise.resolve({ token }) });
  expect(isValidElement(element)).toBe(true);
  return element.props as Record<string, unknown>;
}

describe("InvitePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateServerClient.mockResolvedValue({
      auth: { getUser: mockGetUser },
    });
    mockCreateAdminClient.mockReturnValue({ from: mockAdminFrom });
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockAdminFrom.mockReturnValue(adminInviteQuery(inviteRow()));
    mockInviteClient.mockReturnValue(null);
  });

  it("renders invalid state for malformed tokens without querying invites", async () => {
    const props = await renderInvitePage("not-a-token");

    expect(props).toEqual(
      expect.objectContaining({
        token: "not-a-token",
        mode: "terminal",
        accountName: null,
        errorMessage: "This invitation link is invalid.",
      }),
    );
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
    expect(mockAdminFrom).not.toHaveBeenCalled();
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it("renders invalid state for unknown tokens", async () => {
    mockAdminFrom.mockReturnValue(adminInviteQuery(null));

    const props = await renderInvitePage();

    expect(props).toEqual(
      expect.objectContaining({
        mode: "terminal",
        accountName: null,
        errorMessage: "This invitation link is invalid.",
      }),
    );
    expect(mockAdminFrom).toHaveBeenCalledWith("budget_invitations");
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it("renders public mode for signed-out open invites", async () => {
    const props = await renderInvitePage();

    expect(props).toEqual(
      expect.objectContaining({
        token: TOKEN,
        mode: "public",
        accountName: "Family Budget",
        errorMessage: null,
        invitedEmail: "guest@example.com",
        expiresAt: "2999-01-01T00:00:00.000Z",
      }),
    );
    expect(mockCreateServerClient).toHaveBeenCalled();
    expect(mockGetUser).toHaveBeenCalled();
  });

  it("renders already-used terminal state for accepted invites", async () => {
    mockAdminFrom.mockReturnValue(
      adminInviteQuery(inviteRow({ accepted_at: "2026-05-05T00:00:00.000Z" })),
    );

    const props = await renderInvitePage();

    expect(props).toEqual(
      expect.objectContaining({
        mode: "terminal",
        accountName: "Family Budget",
        errorMessage: "This invitation has already been used.",
      }),
    );
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it("renders unavailable terminal state for declined invites", async () => {
    mockAdminFrom.mockReturnValue(
      adminInviteQuery(inviteRow({ declined_at: "2026-05-05T00:00:00.000Z" })),
    );

    const props = await renderInvitePage();

    expect(props).toEqual(
      expect.objectContaining({
        mode: "terminal",
        accountName: "Family Budget",
        errorMessage: "This invitation is no longer available.",
      }),
    );
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it("renders expired terminal state for expired invites", async () => {
    mockAdminFrom.mockReturnValue(
      adminInviteQuery(inviteRow({ expires_at: "2020-01-01T00:00:00.000Z" })),
    );

    const props = await renderInvitePage();

    expect(props).toEqual(
      expect.objectContaining({
        mode: "terminal",
        accountName: "Family Budget",
        errorMessage:
          "This invitation has expired. Ask the budget owner for a new invite link.",
      }),
    );
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it("renders accept mode for matching authenticated users", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "guest@example.com" } },
    });

    const props = await renderInvitePage();

    expect(props).toEqual(
      expect.objectContaining({
        mode: "accept",
        accountName: "Family Budget",
        errorMessage: null,
        errorCode: null,
        currentUserEmail: "guest@example.com",
      }),
    );
  });

  it("renders wrong-email terminal state for non-matching authenticated users", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "other@example.com" } },
    });

    const props = await renderInvitePage();

    expect(props).toEqual(
      expect.objectContaining({
        mode: "terminal",
        accountName: null,
        errorCode: "wrong-email",
        invitedEmail: "guest@example.com",
        currentUserEmail: "other@example.com",
      }),
    );
    expect(props.errorMessage).toEqual(
      expect.stringContaining("different email address"),
    );
  });
});
