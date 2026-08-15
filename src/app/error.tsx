"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OddsHunterMascot } from "@/components/shared/odds-hunter-mascot";

/**
 * Root-segment error boundary — without this, any unhandled exception in a
 * server component or server action (a Stripe call that isn't wrapped, a
 * DB write that races, a bug we haven't found yet) falls through to Next's
 * bare default error page. This keeps a failure on-brand and gives the
 * user a real way forward instead of a dead end.
 */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <OddsHunterMascot variant="compact" parallax={false} className="mb-4 opacity-80" />
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-signal-extreme/10">
        <TriangleAlert className="h-5 w-5 text-signal-extreme" strokeWidth={1.75} />
      </div>
      <h1 className="text-sm font-medium text-foreground">Something went wrong.</h1>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
        This page hit an unexpected error. It has been logged — try again, or head back to the Overview.
      </p>
      {error.digest && <p className="mt-2 font-mono text-[11px] text-muted-foreground/60">Ref: {error.digest}</p>}
      <div className="mt-5 flex gap-2">
        <Button onClick={() => reset()}>Try again</Button>
        <Button variant="outline" render={<Link href="/" />} nativeButton={false}>
          Back to Overview
        </Button>
      </div>
    </div>
  );
}
