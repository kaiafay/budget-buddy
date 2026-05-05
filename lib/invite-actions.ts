"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

type AcceptInvitationRpcResult = {
  account_id: string | null;
  account_name: string | null;
  error_message: string | null;
};

const inviteTokenPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function acceptInvitation(token: string): Promise<{
  data: { accountId: string; accountName: string } | null;
  error: string | null;
}> {
  if (!inviteTokenPattern.test(token)) {
    return { data: null, error: "Invalid invitation link." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated." };

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data, error } = await adminClient
    .rpc("accept_budget_invitation", {
      p_token: token,
      p_user_id: user.id,
      p_user_email: user.email?.toLowerCase() ?? "",
    })
    .single();

  if (error) {
    console.error("accept_budget_invitation failed", error);
    return { data: null, error: "Failed to join budget. Please try again." };
  }

  const result = data as AcceptInvitationRpcResult | null;
  if (!result) {
    return { data: null, error: "Failed to join budget. Please try again." };
  }
  if (result.error_message) {
    return { data: null, error: result.error_message };
  }
  if (!result.account_id) {
    return { data: null, error: "Failed to join budget. Please try again." };
  }

  return {
    data: {
      accountId: result.account_id,
      accountName: result.account_name ?? "Shared Budget",
    },
    error: null,
  };
}

export async function declineInvitation(token: string): Promise<{
  data: { declined: true } | null;
  error: string | null;
}> {
  if (!inviteTokenPattern.test(token)) {
    return { data: null, error: "Invalid invitation link." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated." };

  const userEmail = user.email?.toLowerCase() ?? "";
  if (!userEmail) return { data: null, error: "Not authenticated." };

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: invite, error: inviteError } = await adminClient
    .from("budget_invitations")
    .select("id, invited_email, expires_at, accepted_at, declined_at")
    .eq("token", token)
    .maybeSingle();

  if (inviteError) {
    console.error("load invitation for decline failed", inviteError);
    return { data: null, error: "Failed to decline invitation. Please try again." };
  }
  if (!invite) {
    return { data: null, error: "Invalid invitation link." };
  }
  if (invite.accepted_at) {
    return { data: null, error: "This invitation has already been used." };
  }
  if (invite.declined_at) {
    return { data: null, error: "This invitation is no longer available." };
  }
  if (new Date(invite.expires_at as string) < new Date()) {
    return { data: null, error: "This invitation has expired." };
  }
  if ((invite.invited_email as string) !== userEmail) {
    return {
      data: null,
      error: "This invitation was sent to a different email address.",
    };
  }

  const { data: updated, error: updateError } = await adminClient
    .from("budget_invitations")
    .update({ declined_at: new Date().toISOString() })
    .eq("id", invite.id)
    .is("accepted_at", null)
    .is("declined_at", null)
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error("decline invitation failed", updateError);
    return { data: null, error: "Failed to decline invitation. Please try again." };
  }
  if (!updated) {
    return { data: null, error: "This invitation is no longer available." };
  }

  return { data: { declined: true }, error: null };
}
