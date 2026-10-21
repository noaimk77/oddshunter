"use client";

import { useEffect } from "react";
import { MessageCircle } from "lucide-react";

/**
 * Fires right after a successful Stripe checkout for the Bot plan: sends
 * the browser straight to the Telegram deep link instead of leaving the
 * user to find and click a separate "link Telegram" button — "pay once,
 * land on Telegram" in one motion. The visible link is a fallback for
 * browsers that block an immediate script-driven navigation.
 */
export function TelegramAutoRedirect({ url }: { url: string }) {
  useEffect(() => {
    window.location.href = url;
  }, [url]);

  return (
    <div className="space-y-2">
      <p className="text-sm text-foreground">Paiement confirmé — direction Telegram…</p>
      <a
        href={url}
        className="inline-flex items-center gap-2 text-sm font-medium text-gold underline underline-offset-2"
      >
        <MessageCircle className="h-4 w-4" /> La redirection ne s'est pas lancée ? Clique ici.
      </a>
    </div>
  );
}
