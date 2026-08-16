"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { registerAction, type RegisterState } from "./actions";

const initialState: RegisterState = {};

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);

  return (
    <div className="rounded-lg border border-border/70 bg-card/50 p-6">
      <h1 className="text-lg font-semibold text-foreground">Créer ton compte</h1>
      <p className="mt-1 text-sm text-muted-foreground">Rejoins le groupe VIP ou le bot Odds Hunter.</p>

      <form action={formAction} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
          {state.fieldErrors?.email && <p className="text-xs text-signal-extreme">{state.fieldErrors.email}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Mot de passe</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required />
          {state.fieldErrors?.password && <p className="text-xs text-signal-extreme">{state.fieldErrors.password}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
          <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
          {state.fieldErrors?.confirmPassword && (
            <p className="text-xs text-signal-extreme">{state.fieldErrors.confirmPassword}</p>
          )}
        </div>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Création du compte…" : "Créer le compte"}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        Déjà un compte ?{" "}
        <Link href="/login" className="font-medium text-gold hover:underline">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
