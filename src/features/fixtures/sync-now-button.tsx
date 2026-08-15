"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SyncNowButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function run() {
    setState("loading");
    try {
      const res = await fetch("/api/sync/football", { method: "POST" });
      if (!res.ok && res.status !== 429) throw new Error("sync failed");
      router.refresh();
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={run} disabled={state === "loading"}>
      <RefreshCw className={cn("h-3.5 w-3.5", state === "loading" && "animate-spin")} />
      {state === "loading" ? "Synchronisation… (jusqu'à 1 min)" : state === "error" ? "Échec — réessayer" : "Synchroniser maintenant"}
    </Button>
  );
}
