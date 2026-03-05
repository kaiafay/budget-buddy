"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Wallet } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Mode = "signin" | "signup"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [mode, setMode] = useState<Mode>("signin")
  const [error, setError] = useState<string | null>(null)
  const [signUpSuccess, setSignUpSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSignUpSuccess(false)

    const supabase = createClient()

    if (mode === "signin") {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) {
        setError("Invalid email or password")
        return
      }
      router.push("/")
      return
    }

    const { error: signUpError } = await supabase.auth.signUp({ email, password })
    if (signUpError) {
      setError(signUpError.message)
      return
    }
    setSignUpSuccess(true)
  }

  function switchMode() {
    setMode((m) => (m === "signin" ? "signup" : "signin"))
    setError(null)
    setSignUpSuccess(false)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 pb-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
            <Wallet className="h-7 w-7 text-primary-foreground" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Budget Buddy
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to manage your budget"
              : "Create an account to get started"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email" className="text-sm font-medium text-foreground">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-xl border-border bg-card"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password" className="text-sm font-medium text-foreground">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-xl border-border bg-card"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {signUpSuccess && (
            <p className="text-sm text-green-600 dark:text-green-400" role="status">
              Check your email to confirm your account
            </p>
          )}

          <Button
            type="submit"
            className="mt-2 h-11 w-full rounded-xl bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {mode === "signin" ? "Sign in" : "Sign up"}
          </Button>
        </form>

        <p className="pt-8 text-center text-xs text-muted-foreground">
          {mode === "signin" ? (
            <>
              {"Don't have an account? "}
              <button
                type="button"
                onClick={switchMode}
                className="font-medium text-primary hover:underline"
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
                className="font-medium text-primary hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
