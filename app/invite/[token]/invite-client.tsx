"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/inline-error";
import { acceptInvitation, declineInvitation } from "@/lib/invite-actions";
import { createClient } from "@/lib/supabase/client";

interface InviteClientProps {
  token: string;
  mode?: "public" | "accept" | "terminal";
  accountName: string | null;
  errorMessage: string | null;
  errorCode?: "wrong-email" | null;
  invitedEmail?: string | null;
  expiresAt?: string | null;
  currentUserEmail?: string | null;
}

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${local.length > 2 ? "***" : "*"}@${domain}`;
}

export function InviteClient({
  token,
  mode = "accept",
  accountName,
  errorMessage,
  errorCode = null,
  invitedEmail = null,
  expiresAt = null,
  currentUserEmail = null,
}: InviteClientProps) {
  const router = useRouter();
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
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

  async function handleDecline() {
    setDeclining(true);
    setError(null);
    const { data, error: actionError } = await declineInvitation(token);
    if (actionError || !data) {
      setError(actionError ?? "Something went wrong. Please try again.");
      setDeclining(false);
      return;
    }
    setDeclined(true);
    setDeclining(false);
  }

  async function handleUseAnotherAccount() {
    setSigningOut(true);
    setError(null);
    const supabase = createClient();
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      setSigningOut(false);
      return;
    }
    router.push(`/login?next=/invite/${token}`);
  }

  function handleContinue() {
    const params = new URLSearchParams();
    if (invitedEmail) {
      params.set("email", invitedEmail);
    }
    params.set("next", `/invite/${token}`);
    router.push(`/login?${params.toString()}`);
  }

  if (mode === "public") {
    const maskedInvitedEmail = maskEmail(invitedEmail);
    const formattedExpiry = expiresAt
      ? new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(expiresAt))
      : null;

    return (
      <AuthCard subtitle="Budget invitation">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-sm text-white/70">You&apos;ve been invited to join</p>
            <p className="text-lg font-semibold text-white">{accountName}</p>
            {maskedInvitedEmail && (
              <p className="text-sm text-white/60">Sent to {maskedInvitedEmail}</p>
            )}
            {formattedExpiry && (
              <p className="text-xs text-white/50">Expires {formattedExpiry}</p>
            )}
          </div>

          <Button
            onClick={handleContinue}
            className="h-11 w-full bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Continue
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (declined) {
    return (
      <AuthCard subtitle="Budget invitation">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-white/70">
            This invitation has been declined.
          </p>
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

  if (errorMessage || mode === "terminal") {
    const isWrongEmail = errorCode === "wrong-email";
    const maskedInvitedEmail = maskEmail(invitedEmail);

    return (
      <AuthCard subtitle="Budget invitation">
        <div className="flex flex-col items-center gap-4 text-center">
          {isWrongEmail ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-white/70">
                This invitation was sent to{" "}
                <span className="text-white">
                  {maskedInvitedEmail ?? "a different email"}
                </span>
                .
              </p>
              {currentUserEmail && (
                <p className="text-xs text-white/50">
                  You&apos;re signed in as {currentUserEmail}.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-white/70">{errorMessage}</p>
          )}
          {error && <InlineError>{error}</InlineError>}
          {isWrongEmail && (
            <Button
              onClick={handleUseAnotherAccount}
              disabled={signingOut}
              className="h-11 w-full bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {signingOut ? "Signing out..." : "Use another account"}
            </Button>
          )}
          <Button
            onClick={() => router.push("/")}
            variant={isWrongEmail ? "ghost" : "default"}
            disabled={signingOut}
            className={
              isWrongEmail
                ? "h-11 w-full text-sm text-white/70 hover:bg-white/10 hover:text-white active:bg-white/15"
                : "h-11 w-full bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
            }
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
          disabled={accepting || declining}
          className="h-11 w-full bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {accepting ? "Joining..." : "Accept invitation"}
        </Button>
        <Button
          variant="ghost"
          onClick={handleDecline}
          disabled={accepting || declining}
          className="h-11 w-full text-sm text-white/70 hover:bg-white/10 hover:text-white active:bg-white/15"
        >
          {declining ? "Declining..." : "Decline invitation"}
        </Button>
      </div>
    </AuthCard>
  );
}
