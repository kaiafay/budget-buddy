"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function acceptInvitation(token: string): Promise<{
  data: { accountId: string; accountName: string } | null;
  error: string | null;
}> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
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

  const { data: invite } = await adminClient
    .from("budget_invitations")
    .select("id, account_id, invited_email, invited_by, expires_at, accepted_at, accounts(name)")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return { data: null, error: "Invalid or expired invitation." };
  if (invite.accepted_at) return { data: null, error: "This invitation has already been used." };
  if (new Date(invite.expires_at) < new Date()) {
    return { data: null, error: "This invitation has expired." };
  }
  if (invite.invited_email !== user.email?.toLowerCase()) {
    return { data: null, error: "This invitation was sent to a different email address." };
  }

  // Idempotent: if already a member, just mark the invite accepted and succeed
  const { data: existing } = await adminClient
    .from("account_members")
    .select("id")
    .eq("account_id", invite.account_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    const { error: memberError } = await adminClient.from("account_members").insert({
      account_id: invite.account_id,
      user_id: user.id,
      role: "member",
      invited_by: invite.invited_by,
    });
    if (memberError) return { data: null, error: "Failed to join budget. Please try again." };
  }

  await adminClient
    .from("budget_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  const accountName =
    (invite.accounts as unknown as { name: string } | null)?.name ?? "Shared Budget";
  return { data: { accountId: invite.account_id as string, accountName }, error: null };
}
