"use client";

import { useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { glassInputClass } from "@/lib/glass-classes";
import { USER_FACING_ERROR } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/inline-error";
import { AuthCard } from "@/components/auth-card";

type Mode = "signin" | "signup" | "forgot";

type FormState = {
  mode: Mode;
  firstName: string;
  lastName: string;
  inviteCode: string;
  error: string | null;
  signUpSuccess: boolean;
  resetSent: boolean;
};

type FormAction =
  | { type: "GO_TO_MODE"; mode: Mode }
  | { type: "SET_FIELD"; field: "firstName" | "lastName" | "inviteCode"; value: string }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SIGN_UP_SUCCESS" }
  | { type: "RESET_SENT" };

const initialState: FormState = {
  mode: "signin",
  firstName: "",
  lastName: "",
  inviteCode: "",
  error: null,
  signUpSuccess: false,
  resetSent: false,
};

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "GO_TO_MODE":
      return { ...initialState, mode: action.mode };
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "SET_ERROR":
      return { ...state, error: action.error };
    case "SIGN_UP_SUCCESS":
      return { ...state, signUpSuccess: true, error: null };
    case "RESET_SENT":
      return { ...state, resetSent: true, error: null };
  }
}

const inviteGateEnabled = (process.env.NEXT_PUBLIC_INVITE_CODE ?? "") !== "";

export default function LoginPage() {
  const router = useRouter();
  const [state, dispatch] = useReducer(formReducer, initialState);
  const { mode, firstName, lastName, inviteCode, error, signUpSuccess, resetSent } = state;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function goToMode(target: Mode) {
    dispatch({ type: "GO_TO_MODE", mode: target });
    setPassword("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    dispatch({ type: "SET_ERROR", error: null });

    const supabase = createClient();

    if (mode === "forgot") {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: window.location.origin,
        },
      );
      if (resetError) {
        dispatch({ type: "SET_ERROR", error: USER_FACING_ERROR });
        return;
      }
      dispatch({ type: "RESET_SENT" });
      return;
    }

    if (mode === "signin") {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        dispatch({ type: "SET_ERROR", error: "Invalid email or password" });
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      router.push(next && next.startsWith("/") ? next : "/");
      return;
    }

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    if (!trimmedFirst || !trimmedLast) {
      dispatch({
        type: "SET_ERROR",
        error: "Please enter your first and last name",
      });
      return;
    }

    if (password.length < 8) {
      dispatch({
        type: "SET_ERROR",
        error: "Password must be at least 8 characters long.",
      });
      return;
    }
    if (!/\d/.test(password)) {
      dispatch({
        type: "SET_ERROR",
        error: "Password must include at least one number.",
      });
      return;
    }
    if (!/[a-zA-Z]/.test(password)) {
      dispatch({
        type: "SET_ERROR",
        error: "Password must include at least one letter.",
      });
      return;
    }

    const expectedInvite = process.env.NEXT_PUBLIC_INVITE_CODE ?? "";
    if (expectedInvite !== "" && inviteCode.trim() !== expectedInvite) {
      dispatch({ type: "SET_ERROR", error: "Invalid invite code." });
      return;
    }

    // P1-4: carry ?next= through the email confirmation link so a new user
    // who signed up via an invite link lands on /invite/{token} after confirming.
    const signUpParams = new URLSearchParams(window.location.search);
    const signUpNext = signUpParams.get("next");
    const emailRedirectTo =
      signUpNext && signUpNext.startsWith("/")
        ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(signUpNext)}`
        : `${window.location.origin}/auth/confirm`;
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp(
      {
        email,
        password,
        options: {
          emailRedirectTo,
          data: {
            given_name: trimmedFirst,
            family_name: trimmedLast,
          },
        },
      },
    );
    if (signUpError) {
      dispatch({ type: "SET_ERROR", error: signUpError.message });
      return;
    }
    if (signUpData.user?.identities?.length === 0) {
      dispatch({
        type: "SET_ERROR",
        error: "An account with this email already exists.",
      });
      return;
    }
    dispatch({ type: "SIGN_UP_SUCCESS" });
  }

  const subtitle =
    signUpSuccess || resetSent
      ? undefined
      : mode === "signin"
        ? "Sign in to manage your budget"
        : mode === "signup"
          ? "Create an account to get started"
          : "Reset your password";

  return (
    <AuthCard subtitle={subtitle}>
      {signUpSuccess && (
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-2">
            <p className="text-base font-medium text-white">
              You&apos;re almost in!
            </p>
          </div>
          <p className="text-sm text-white/70">
            Check your inbox at
            <br />
            <span className="text-white">{email}</span>
            <br />
            to activate your account.
          </p>
        </div>
      )}

      {resetSent && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-base font-medium text-white">Check your email</p>
          <p className="text-sm text-white/70">
            A password reset link has been sent to
            <br />
            <span className="text-white">{email}</span>
          </p>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className={signUpSuccess || resetSent ? "hidden" : "flex flex-col gap-5"}
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
                onChange={(e) =>
                  dispatch({
                    type: "SET_FIELD",
                    field: "firstName",
                    value: e.target.value,
                  })
                }
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
                onChange={(e) =>
                  dispatch({
                    type: "SET_FIELD",
                    field: "lastName",
                    value: e.target.value,
                  })
                }
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
                  onChange={(e) =>
                    dispatch({
                      type: "SET_FIELD",
                      field: "inviteCode",
                      value: e.target.value,
                    })
                  }
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

        {mode !== "forgot" && (
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
            {mode === "signin" && (
              <div className="flex justify-end pr-1">
                <button
                  type="button"
                  onClick={() => goToMode("forgot")}
                  className="text-xs leading-none text-white/70 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            )}
          </div>
        )}

        {error && <InlineError>{error}</InlineError>}

        <Button
          type="submit"
          className="mt-2 h-11 w-full bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {mode === "signin"
            ? "Sign in"
            : mode === "signup"
              ? "Sign up"
              : "Send reset link"}
        </Button>
      </form>

      {!signUpSuccess && !resetSent && (
        <p className="pt-6 text-center text-xs text-white/70">
          {mode === "signin" ? (
            <>
              {"Don't have an account? "}
              <button
                type="button"
                onClick={() => goToMode("signup")}
                className="font-medium text-white/70 hover:underline"
              >
                Sign up
              </button>
            </>
          ) : mode === "signup" ? (
            <>
              {"Already have an account? "}
              <button
                type="button"
                onClick={() => goToMode("signin")}
                className="font-medium text-white/70 hover:underline"
              >
                Sign in
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => goToMode("signin")}
              className="font-medium text-white/70 hover:underline"
            >
              Back to sign in
            </button>
          )}
        </p>
      )}
    </AuthCard>
  );
}
