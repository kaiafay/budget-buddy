"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/inline-error";
import { acceptInvitation } from "@/lib/invite-actions";

interface InviteClientProps {
  token: string;
  accountName: string | null;
  errorMessage: string | null;
}

export function InviteClient({
  token,
  accountName,
  errorMessage,
}: InviteClientProps) {
  const router = useRouter();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setAccepting(true);
    setError(null);
    const { data, error: actionError } = await acceptInvitation(token);
    if (actionError || !data) {
      setError(actionError ?? "Something went wrong. Please try again.");
      setAccepting(false);
      return;
    }
    router.push(`/?account=${data.accountId}`);
  }

  if (errorMessage) {
    return (
      <AuthCard subtitle="Budget invitation">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-white/70">{errorMessage}</p>
          <Button
            onClick={() => router.push("/")}
            className="h-11 w-full bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to Budget Buddy
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard subtitle="Budget invitation">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-white/70">You&apos;ve been invited to join</p>
          <p className="text-lg font-semibold text-white">{accountName}</p>
        </div>

        {error && <InlineError>{error}</InlineError>}

        <Button
          onClick={handleAccept}
          disabled={accepting}
          className="h-11 w-full bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {accepting ? "Joining..." : "Accept invitation"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => router.push("/")}
          disabled={accepting}
          className="h-11 w-full text-sm text-white/70 hover:text-white"
        >
          Decline
        </Button>
      </div>
    </AuthCard>
  );
}
