import { createClient } from "@/lib/supabase/server";
import SettingsForm from "@/components/settings-form";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let initialName = "";
  let initialBalance = "";
  let accountId = null;

  if (user) {
    const { data } = await supabase
      .from("accounts")
      .select("id, name, starting_balance")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      initialName = data.name ?? "";
      initialBalance =
        data.starting_balance != null ? String(data.starting_balance) : "";
      accountId = data.id;
    }
  }

  return (
    <div className="flex flex-col">
      <header className="page-enter-1 px-5 pb-6 pt-6">
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-white/70">Manage your account preferences</p>
      </header>
      <SettingsForm
        initialName={initialName}
        initialBalance={initialBalance}
        accountId={accountId}
      />
    </div>
  );
}
