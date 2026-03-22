"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { glassInputClass } from "@/lib/glass-classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
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

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: `${trimmedFirst} ${trimmedLast}`,
        },
      },
    });
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    if (signUpData.user) {
      await supabase.from("accounts").insert({
        user_id: signUpData.user.id,
        name: "My Account",
        starting_balance: 0,
      });
    }
    setSignUpSuccess(true);
  }

  function switchMode() {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setError(null);
    setSignUpSuccess(false);
    setFirstName("");
    setLastName("");
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
          <p className="text-sm text-white/70">
            {mode === "signin"
              ? "Sign in to manage your budget"
              : "Create an account to get started"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
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
            <p className="text-sm text-red-300" role="alert">
              {error}
            </p>
          )}

          {signUpSuccess && (
            <p
              className="text-sm text-green-600 dark:text-green-400"
              role="status"
            >
              Check your email to confirm your account
            </p>
          )}

          <Button
            type="submit"
            className="mt-2 h-11 w-full bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {mode === "signin" ? "Sign in" : "Sign up"}
          </Button>
        </form>

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
      </div>
    </div>
  );
}
