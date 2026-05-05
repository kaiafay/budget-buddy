import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUser = vi.fn();
const mockRpc = vi.fn();
const mockAdminFrom = vi.fn();
const mockAdminSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    rpc: mockRpc,
    from: mockAdminFrom,
  })),
}));

import { acceptInvitation, declineInvitation } from "@/lib/invite-actions";

const INV_TOKEN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ACC_SHARE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function rpcResult(
  result: {
    account_id: string | null;
    account_name: string | null;
    error_message: string | null;
  } | null,
  error: { message: string } | null = null,
) {
  mockAdminSingle.mockResolvedValue({ data: result, error });
  mockRpc.mockReturnValue({ single: mockAdminSingle });
}

function inviteLoadChain(
  result: {
    id: string;
    invited_email: string;
    expires_at: string;
    accepted_at: string | null;
    declined_at: string | null;
  } | null,
  error: { message: string } | null = null,
) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: result, error });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  return { select: vi.fn().mockReturnValue({ eq }) };
}

function declineUpdateChain(
  result: { id: string } | null,
  error: { message: string } | null = null,
) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: result, error });
  const select = vi.fn().mockReturnValue({ maybeSingle });
  const isDeclined = vi.fn().mockReturnValue({ select });
  const isAccepted = vi.fn().mockReturnValue({ is: isDeclined });
  const eq = vi.fn().mockReturnValue({ is: isAccepted });
  return { update: vi.fn().mockReturnValue({ eq }) };
}

describe("acceptInvitation", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockRpc.mockReset();
    mockAdminFrom.mockReset();
    mockAdminSingle.mockReset();
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "Guest@Example.com",
        },
      },
    });
  });

  it("rejects malformed invite tokens before auth or RPC calls", async () => {
    const { data, error } = await acceptInvitation("not-a-token");

    expect(data).toBeNull();
    expect(error).toBe("Invalid invitation link.");
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated users before calling the acceptance RPC", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { data, error } = await acceptInvitation(INV_TOKEN);

    expect(data).toBeNull();
    expect(error).toBe("Not authenticated.");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("calls the acceptance RPC with the authenticated user and lowercased email", async () => {
    rpcResult({
      account_id: ACC_SHARE,
      account_name: "Shared Budget",
      error_message: null,
    });

    const { data, error } = await acceptInvitation(INV_TOKEN);

    expect(error).toBeNull();
    expect(data).toEqual({ accountId: ACC_SHARE, accountName: "Shared Budget" });
    expect(mockRpc).toHaveBeenCalledWith("accept_budget_invitation", {
      p_token: INV_TOKEN,
      p_user_id: "user-1",
      p_user_email: "guest@example.com",
    });
  });

  it("returns structured RPC error messages", async () => {
    rpcResult({
      account_id: null,
      account_name: null,
      error_message: "This invitation was sent to a different email address.",
    });

    const { data, error } = await acceptInvitation(INV_TOKEN);

    expect(data).toBeNull();
    expect(error).toBe("This invitation was sent to a different email address.");
  });

  it("falls back to the default account name when the RPC returns no name", async () => {
    rpcResult({
      account_id: ACC_SHARE,
      account_name: null,
      error_message: null,
    });

    const { data, error } = await acceptInvitation(INV_TOKEN);

    expect(error).toBeNull();
    expect(data).toEqual({ accountId: ACC_SHARE, accountName: "Shared Budget" });
  });

  it("returns a generic error for RPC transport failures", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    rpcResult(null, { message: "database unavailable" });

    const { data, error } = await acceptInvitation(INV_TOKEN);

    expect(data).toBeNull();
    expect(error).toBe("Failed to join budget. Please try again.");
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("returns a generic error when the RPC returns no row", async () => {
    rpcResult(null);

    const { data, error } = await acceptInvitation(INV_TOKEN);

    expect(data).toBeNull();
    expect(error).toBe("Failed to join budget. Please try again.");
  });
});

describe("declineInvitation", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockRpc.mockReset();
    mockAdminFrom.mockReset();
    mockAdminSingle.mockReset();
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "Guest@Example.com",
        },
      },
    });
  });

  it("rejects malformed invite tokens before auth or DB calls", async () => {
    const { data, error } = await declineInvitation("not-a-token");

    expect(data).toBeNull();
    expect(error).toBe("Invalid invitation link.");
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated users before loading the invite", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { data, error } = await declineInvitation(INV_TOKEN);

    expect(data).toBeNull();
    expect(error).toBe("Not authenticated.");
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("rejects wrong-email users before updating the invite", async () => {
    mockAdminFrom.mockReturnValue(
      inviteLoadChain({
        id: "invite-1",
        invited_email: "other@example.com",
        expires_at: "2999-01-01T00:00:00.000Z",
        accepted_at: null,
        declined_at: null,
      }),
    );

    const { data, error } = await declineInvitation(INV_TOKEN);

    expect(data).toBeNull();
    expect(error).toBe("This invitation was sent to a different email address.");
    expect(mockAdminFrom).toHaveBeenCalledTimes(1);
  });

  it("sets declined_at for a matching open invite", async () => {
    let fromCallCount = 0;
    mockAdminFrom.mockImplementation(() => {
      fromCallCount++;
      if (fromCallCount === 1) {
        return inviteLoadChain({
          id: "invite-1",
          invited_email: "guest@example.com",
          expires_at: "2999-01-01T00:00:00.000Z",
          accepted_at: null,
          declined_at: null,
        });
      }
      return declineUpdateChain({ id: "invite-1" });
    });

    const { data, error } = await declineInvitation(INV_TOKEN);

    expect(error).toBeNull();
    expect(data).toEqual({ declined: true });
    expect(mockAdminFrom).toHaveBeenCalledTimes(2);
  });

  it("rejects already accepted invites", async () => {
    mockAdminFrom.mockReturnValue(
      inviteLoadChain({
        id: "invite-1",
        invited_email: "guest@example.com",
        expires_at: "2999-01-01T00:00:00.000Z",
        accepted_at: "2026-05-05T00:00:00.000Z",
        declined_at: null,
      }),
    );

    const { data, error } = await declineInvitation(INV_TOKEN);

    expect(data).toBeNull();
    expect(error).toBe("This invitation has already been used.");
    expect(mockAdminFrom).toHaveBeenCalledTimes(1);
  });

  it("rejects already declined invites", async () => {
    mockAdminFrom.mockReturnValue(
      inviteLoadChain({
        id: "invite-1",
        invited_email: "guest@example.com",
        expires_at: "2999-01-01T00:00:00.000Z",
        accepted_at: null,
        declined_at: "2026-05-05T00:00:00.000Z",
      }),
    );

    const { data, error } = await declineInvitation(INV_TOKEN);

    expect(data).toBeNull();
    expect(error).toBe("This invitation is no longer available.");
    expect(mockAdminFrom).toHaveBeenCalledTimes(1);
  });
});
