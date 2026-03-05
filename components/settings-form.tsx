"use client";

import { useState } from "react";
import { User, DollarSign, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  initialName: string;
  initialBalance: string;
  accountId: string | null;
}

export default function SettingsForm({
  initialName,
  initialBalance,
  accountId: initialAccountId,
}: Props) {
  const [accountName, setAccountName] = useState(initialName);
  const [startingBalance, setStartingBalance] = useState(initialBalance);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(initialAccountId);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be signed in.");
      return;
    }

    const balance = parseFloat(startingBalance);
    if (Number.isNaN(balance)) {
      setError("Please enter a valid starting balance.");
      return;
    }

    if (accountId) {
      const { error: updateError } = await supabase
        .from("accounts")
        .update({ name: accountName, starting_balance: balance })
        .eq("id", accountId);
      if (updateError) {
        setError(updateError.message);
        return;
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("accounts")
        .insert({
          user_id: user.id,
          name: accountName,
          starting_balance: balance,
        })
        .select("id")
        .single();
      if (insertError) {
        setError(insertError.message);
        return;
      }
      if (inserted?.id) setAccountId(inserted.id);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5 px-5 pb-8">
      <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3 pb-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
            <User className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-medium text-foreground">
            Account Details
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="accountName"
            className="text-xs font-medium text-muted-foreground"
          >
            Account Name
          </Label>
          <Input
            id="accountName"
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            className="h-11 rounded-xl border-border bg-background"
            placeholder="e.g. Main Checking"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3 pb-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DCFCE7]">
            <DollarSign className="h-4 w-4 text-[#16A34A]" />
          </div>
          <span className="text-sm font-medium text-foreground">
            Starting Balance
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="balance"
            className="text-xs font-medium text-muted-foreground"
          >
            Amount
          </Label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
              $
            </span>
            <Input
              id="balance"
              type="number"
              step="0.01"
              value={startingBalance}
              onChange={(e) => setStartingBalance(e.target.value)}
              className="h-11 rounded-xl border-border bg-background pl-8 tabular-nums"
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="text-sm text-green-600" role="status">
          Settings saved
        </p>
      )}

      <Button
        type="submit"
        className="h-11 rounded-xl bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        {saved ? "Saved!" : "Save Changes"}
      </Button>

      <div className="pt-4">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          onClick={() => {
            window.location.href = "/login";
          }}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </form>
  );
}
