import SettingsForm from "@/components/settings-form";

export default function SettingsPage() {
  return (
    <div className="flex flex-col pb-6">
      <header className="page-enter-1 px-5 pb-6 pt-6">
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-white/70">Manage your account preferences</p>
      </header>
      <SettingsForm />
    </div>
  );
}
