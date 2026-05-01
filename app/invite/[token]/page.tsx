import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { InviteClient } from "./invite-client";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/invite/${token}`);
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: invite } = await adminClient
    .from("budget_invitations")
    .select("id, invited_email, expires_at, accepted_at, accounts(name)")
    .eq("token", token)
    .maybeSingle();

  let errorMessage: string | null = null;
  let accountName: string | null = null;

  if (!invite) {
    errorMessage = "This invitation link is invalid.";
  } else if (invite.accepted_at) {
    errorMessage = "This invitation has already been used.";
  } else if (new Date(invite.expires_at) < new Date()) {
    errorMessage =
      "This invitation has expired. Ask the budget owner for a new invite link.";
  } else if (invite.invited_email !== user.email?.toLowerCase()) {
    errorMessage =
      "This invitation was sent to a different email address. Make sure you're signed in with the correct account.";
  } else {
    accountName =
      (invite.accounts as unknown as { name: string } | null)?.name ?? "Shared Budget";
  }

  return (
    <InviteClient
      token={token}
      accountName={accountName}
      errorMessage={errorMessage}
    />
  );
}
