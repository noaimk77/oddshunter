"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the code is
      // already selectable as plain text right next to this button.
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-gold" /> Copié
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" /> Copier
        </>
      )}
    </Button>
  );
}
