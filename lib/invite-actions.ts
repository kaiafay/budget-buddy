"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

type AcceptInvitationRpcResult = {
  account_id: string | null;
  account_name: string | null;
  error_message: string | null;
};

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
