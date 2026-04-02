"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { glassInputClass } from "@/lib/glass-classes";
import { USER_FACING_ERROR } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/inline-error";
import { AuthCard } from "@/components/auth-card";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (!/\d/.test(newPassword)) {
      setError("Password must include at least one number.");
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword)) {
      setError("Password must include at least one letter.");
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        setError(USER_FACING_ERROR);
        return;
      }
      router.push("/");
    });
  }

  return (
    <AuthCard subtitle="Reset your password">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="newPassword"
            className="text-sm font-medium text-white/70"
          >
            New password
          </Label>
          <Input
            id="newPassword"
            type="password"
            placeholder="Enter new password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={glassInputClass}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="confirmPassword"
            className="text-sm font-medium text-white/70"
          >
            Confirm password
          </Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={glassInputClass}
            required
          />
        </div>
        {error && <InlineError>{error}</InlineError>}
        <Button
          type="submit"
          disabled={isPending}
          className="mt-2 h-11 w-full bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Reset password
        </Button>
      </form>
    </AuthCard>
  );
}
