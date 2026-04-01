import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(_request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const userId = user.id;

  for (const table of [
    "recurring_exceptions",
    "recurring_rules",
    "transactions",
    "categories",
    "accounts",
  ] as const) {
    const { error } = await adminClient
      .from(table)
      .delete()
      .eq("user_id", userId);
    if (error) {
      return NextResponse.json(
        { error: "Failed to delete account" },
        { status: 500 },
      );
    }
  }

  const { error: deleteUserError } =
    await adminClient.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
