import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { uuidSchema } from "@/lib/validation";
import { InviteClient } from "./invite-client";

function accountNameFromInviteAccounts(
  accounts: unknown,
): string {
  if (Array.isArray(accounts)) {
    return accounts[0]?.name ?? "Shared Budget";
  }
  return (accounts as { name?: string } | null)?.name ?? "Shared Budget";
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!uuidSchema.safeParse(token).success) {
    return (
      <InviteClient
        token={token}
        mode="terminal"
        accountName={null}
        errorMessage="This invitation link is invalid."
      />
    );
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

  if (!invite) {
    return (
      <InviteClient
        token={token}
        mode="terminal"
        accountName={null}
        errorMessage="This invitation link is invalid."
      />
    );
  }

  const accountName = accountNameFromInviteAccounts(invite.accounts);
  const invitedEmail = invite.invited_email as string;
  const expiresAt = invite.expires_at as string;

  if (invite.accepted_at) {
    return (
      <InviteClient
        token={token}
        mode="terminal"
        accountName={accountName}
        errorMessage="This invitation has already been used."
      />
    );
  }

  if (new Date(expiresAt) < new Date()) {
    return (
      <InviteClient
        token={token}
        mode="terminal"
        accountName={accountName}
        errorMessage="This invitation has expired. Ask the budget owner for a new invite link."
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <InviteClient
        token={token}
        mode="public"
        accountName={accountName}
        errorMessage={null}
        invitedEmail={invitedEmail}
        expiresAt={expiresAt}
      />
    );
  }

  const isWrongEmail = invitedEmail !== user.email?.toLowerCase();

  return (
    <InviteClient
      token={token}
      mode={isWrongEmail ? "terminal" : "accept"}
      accountName={isWrongEmail ? null : accountName}
      errorMessage={
        isWrongEmail
          ? "This invitation was sent to a different email address. Make sure you're signed in with the correct account."
          : null
      }
      errorCode={isWrongEmail ? "wrong-email" : null}
      invitedEmail={isWrongEmail ? invitedEmail : null}
      currentUserEmail={user.email ?? null}
    />
  );
}
