"use client";

import { useState } from "react";
import { User, DollarSign, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mockSettings } from "@/lib/mock-data";

export default function SettingsPage() {
  const [accountName, setAccountName] = useState(mockSettings.accountName);
  const [startingBalance, setStartingBalance] = useState(
    String(mockSettings.startingBalance),
  );
  const [saved, setSaved] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    // Mock save
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-col">
      <header className="px-5 pb-6 pt-6">
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account preferences
        </p>
      </header>

      <form onSubmit={handleSave} className="flex flex-col gap-5 px-5 pb-8">
        {/* Account name */}
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

        {/* Starting balance */}
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

        {/* Save button */}
        <Button
          type="submit"
          className="h-11 rounded-xl bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {saved ? "Saved!" : "Save Changes"}
        </Button>

        {/* Sign out */}
        <div className="pt-4">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            onClick={() => {
              // Mock sign out
              window.location.href = "/login";
            }}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </form>
    </div>
  );
}
