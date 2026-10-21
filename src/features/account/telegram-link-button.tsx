"use client";

import { useActionState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createTelegramLinkAction, type TelegramLinkState } from "@/app/account/actions";

const initialState: TelegramLinkState = {};

/**
 * Generates a fresh one-time Telegram deep link on click, then opens it —
 * a new token every click, so a link left visible on screen from a previous
 * session can't be replayed (it's already consumed the moment /start fires).
 */
export function TelegramLinkButton() {
  const [state, formAction, pending] = useActionState(createTelegramLinkAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <Button type="submit" size="lg" disabled={pending} className="gap-2">
        <MessageCircle className="h-4 w-4" />
        {pending ? "Génération du lien…" : "Lier mon compte Telegram"}
      </Button>
      {state.error && <p className="text-xs text-signal-extreme">{state.error}</p>}
      {state.url && (
        <p className="text-xs text-muted-foreground">
          Lien à usage unique (valide 15 min) :{" "}
          <a href={state.url} target="_blank" rel="noopener noreferrer" className="text-gold underline">
            ouvrir Telegram
          </a>
        </p>
      )}
    </form>
  );
}
