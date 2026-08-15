"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { forgotPasswordAction, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = {};

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, initialState);

  return (
    <div className="rounded-lg border border-border/70 bg-card/50 p-6">
      <h1 className="text-lg font-semibold text-foreground">Reset your password</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter your account email and we&apos;ll generate a reset link.
      </p>

      {state.submitted ? (
        <div className="mt-6 space-y-3">
          <p className="rounded-md border border-positive/20 bg-positive/10 px-3 py-2 text-xs text-positive">
            If an account exists for that email, a reset link has been generated.
          </p>
          {state.devResetUrl && (
            <div className="rounded-md border border-signal-watch/25 bg-signal-watch/10 px-3 py-2 text-xs text-signal-watch">
              <p className="font-medium">Dev mode — no email provider is connected yet.</p>
              <Link href={state.devResetUrl} className="mt-1 block break-all underline">
                {state.devResetUrl}
              </Link>
            </div>
          )}
        </div>
      ) : (
        <form action={formAction} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
            {state.fieldErrors?.email && <p className="text-xs text-signal-extreme">{state.fieldErrors.email}</p>}
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}

      <p className="mt-5 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-gold hover:underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
