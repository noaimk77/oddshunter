import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OddsHunterMascot } from "@/components/shared/odds-hunter-mascot";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <OddsHunterMascot variant="compact" parallax={false} className="mb-4 opacity-80" />
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-signal-watch/10">
        <Compass className="h-5 w-5 text-signal-watch" strokeWidth={1.75} />
      </div>
      <h1 className="text-sm font-medium text-foreground">Page not found.</h1>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
        There&apos;s nothing here — the market, page, or link may have moved.
      </p>
      <Button className="mt-5" render={<Link href="/" />} nativeButton={false}>
        Back to Overview
      </Button>
    </div>
  );
}
