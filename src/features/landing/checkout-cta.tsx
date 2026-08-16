"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Real Stripe Checkout — same /api/stripe/checkout route the Account page
 * uses, never a fake "coming soon" button. A logged-out click goes to
 * registration first (the route requires a real session), not a dead end.
 */
export function CheckoutCta({
  priceId,
  isAuthenticated,
  label,
  className,
  variant = "default",
}: {
  priceId: string;
  isAuthenticated: boolean;
  label: string;
  className?: string;
  variant?: "default" | "outline";
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleClick = async () => {
    if (!isAuthenticated) {
      router.push("/register");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json().catch(() => null);
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      setError(data?.error ?? "Une erreur est survenue. Réessaie dans un instant.");
    } catch {
      setError("Impossible de contacter le serveur. Vérifie ta connexion.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Button
        size="lg"
        variant={variant}
        className={cn("w-full", className)}
        disabled={loading}
        onClick={handleClick}
      >
        {loading ? "Redirection…" : label}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-center text-xs text-signal-extreme">
          {error}
        </p>
      )}
    </div>
  );
}
