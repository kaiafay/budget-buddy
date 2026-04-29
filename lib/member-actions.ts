"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { AccountMember } from "@/lib/types";

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function getAccountMembers(accountId: string): Promise<{
  data: AccountMember[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated." };

  const admin = adminClient();

  // Verify the caller is a member of this account before revealing the list
  const { data: selfRow } = await admin
    .from("account_members")
    .select("role")
    .eq("account_id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!selfRow) return { data: null, error: "Access denied." };

  const { data: rows, error } = await admin
    .from("account_members")
    .select("id, account_id, user_id, role, invited_by, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });
  if (error) return { data: null, error: "Failed to load members." };

  const members = await Promise.all(
    (rows ?? []).map(async (row) => {
      const { data: { user: authUser } } =
        await admin.auth.admin.getUserById(row.user_id);
      return {
        id: row.id as string,
        account_id: row.account_id as string,
        user_id: row.user_id as string,
        role: row.role as "owner" | "member",
        invited_by: row.invited_by as string,
        created_at: row.created_at as string,
        email: authUser?.email ?? "Unknown",
      } satisfies AccountMember;
    }),
  );

  return { data: members, error: null };
}

export async function checkOwnedAccountsWithMembers(): Promise<{
  blockedBy: string[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { blockedBy: [] };

  const { data: ownedAccounts } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("user_id", user.id);
  if (!ownedAccounts?.length) return { blockedBy: [] };

  const admin = adminClient();
  const { data: memberRows } = await admin
    .from("account_members")
    .select("account_id")
    .in(
      "account_id",
      ownedAccounts.map((a) => a.id),
    )
    .eq("role", "member");

  const accountIdsWithMembers = new Set((memberRows ?? []).map((r) => r.account_id));
  const blockedBy = ownedAccounts
    .filter((a) => accountIdsWithMembers.has(a.id))
    .map((a) => a.name as string);

  return { blockedBy };
}
