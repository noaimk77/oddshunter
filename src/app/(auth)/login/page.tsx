"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

function ResetSuccessNotice() {
  const searchParams = useSearchParams();
  if (searchParams.get("reset") !== "success") return null;
  return (
    <p className="mt-4 rounded-md border border-positive/20 bg-positive/10 px-3 py-2 text-xs text-positive">
      Ton mot de passe a été réinitialisé. Connecte-toi avec ton nouveau mot de passe.
    </p>
  );
}

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div className="rounded-lg border border-border/70 bg-card/50 p-6">
      <h1 className="text-lg font-semibold text-foreground">Connexion</h1>
      <p className="mt-1 text-sm text-muted-foreground">Content de te revoir sur Odds Hunter.</p>

      <Suspense fallback={null}>
        <ResetSuccessNotice />
      </Suspense>

      <form action={formAction} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
          {state.fieldErrors?.email && <p className="text-xs text-signal-extreme">{state.fieldErrors.email}</p>}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Mot de passe</Label>
            <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-gold">
              Mot de passe oublié ?
            </Link>
          </div>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
          {state.fieldErrors?.password && <p className="text-xs text-signal-extreme">{state.fieldErrors.password}</p>}
        </div>
        {state.error && <p className="text-xs text-signal-extreme">{state.error}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Connexion…" : "Se connecter"}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        Pas encore de compte ?{" "}
        <Link href="/register" className="font-medium text-gold hover:underline">
          En créer un
        </Link>
      </p>
    </div>
  );
}
