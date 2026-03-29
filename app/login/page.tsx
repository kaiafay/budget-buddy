"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { glassInputClass } from "@/lib/glass-classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";

type Mode = "signin" | "signup";

const inviteGateEnabled = (process.env.NEXT_PUBLIC_INVITE_CODE ?? "") !== "";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [mode, setMode] = useState<Mode>("signin");
  const [error, setError] = useState<string | null>(null);
  const [signUpSuccess, setSignUpSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSignUpSuccess(false);

    const supabase = createClient();

    if (mode === "signin") {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError("Invalid email or password");
        return;
      }
      router.push("/");
      return;
    }

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    if (!trimmedFirst || !trimmedLast) {
      setError("Please enter your first and last name");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (!/\d/.test(password)) {
      setError("Password must include at least one number.");
      return;
    }
    if (!/[a-zA-Z]/.test(password)) {
      setError("Password must include at least one letter.");
      return;
    }

    const expectedInvite = process.env.NEXT_PUBLIC_INVITE_CODE ?? "";
    if (expectedInvite !== "") {
      if (inviteCode.trim() !== expectedInvite) {
        setError("Invalid invite code.");
        return;
      }
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp(
      {
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
          data: {
            given_name: trimmedFirst,
            family_name: trimmedLast,
          },
        },
      },
    );
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    if (signUpData.user?.identities?.length === 0) {
      setError("An account with this email already exists.");
      return;
    }
    setSignUpSuccess(true);
  }

  function switchMode() {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setError(null);
    setSignUpSuccess(false);
    setFirstName("");
    setLastName("");
    setInviteCode("");
  }

  return (
    <div className="animated-gradient flex min-h-screen items-center justify-center px-6">
      <div className="glass-card w-full max-w-sm rounded-3xl p-6">
        <div className="flex flex-col items-center gap-2 pb-10">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl">
            <Image
              src="/apple-touch-icon.png"
              alt=""
              width={56}
              height={56}
              className="object-cover"
              priority
            />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Budget Buddy
          </h1>
          {!signUpSuccess && (
            <p className="text-sm text-white/70">
              {mode === "signin"
                ? "Sign in to manage your budget"
                : "Create an account to get started"}
            </p>
          )}
        </div>

        {signUpSuccess && (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex items-center gap-2">
              <p className="text-base font-medium text-white">
                You're almost in!
              </p>
            </div>
            <p className="text-sm text-white/70">
              Check your inbox at <span className="text-white">{email}</span> to
              activate your account.
            </p>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className={signUpSuccess ? "hidden" : "flex flex-col gap-5"}
        >
          {mode === "signup" && (
            <>
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="firstName"
                  className="text-sm font-medium text-white/70"
                >
                  First name
                </Label>
                <Input
                  id="firstName"
                  type="text"
                  autoComplete="given-name"
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={glassInputClass}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="lastName"
                  className="text-sm font-medium text-white/70"
                >
                  Last name
                </Label>
                <Input
                  id="lastName"
                  type="text"
                  autoComplete="family-name"
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={glassInputClass}
                  required
                />
              </div>
              {inviteGateEnabled && (
                <div className="flex flex-col gap-2">
                  <Label
                    htmlFor="inviteCode"
                    className="text-sm font-medium text-white/70"
                  >
                    Invite code
                  </Label>
                  <Input
                    id="inviteCode"
                    type="text"
                    autoComplete="off"
                    placeholder="Enter invite code"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    className={glassInputClass}
                    required={inviteGateEnabled}
                  />
                </div>
              )}
            </>
          )}

          <div className="flex flex-col gap-2">
            <Label
              htmlFor="email"
              className="text-sm font-medium text-white/70"
            >
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={glassInputClass}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label
              htmlFor="password"
              className="text-sm font-medium text-white/70"
            >
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={glassInputClass}
              required
            />
          </div>

          {error && (
            <p
              className="flex items-center gap-1.5 text-sm text-white"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-300" />
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="mt-2 h-11 w-full bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {mode === "signin" ? "Sign in" : "Sign up"}
          </Button>
        </form>

        {!signUpSuccess && (
          <p className="pt-6 text-center text-xs text-white/70">
            {mode === "signin" ? (
              <>
                {"Don't have an account? "}
                <button
                  type="button"
                  onClick={switchMode}
                  className="font-medium text-white/70 hover:underline"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                {"Already have an account? "}
                <button
                  type="button"
                  onClick={switchMode}
                  className="font-medium text-white/70 hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
