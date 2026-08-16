import { Landmark } from "lucide-react";
import { Reveal } from "./reveal";

/**
 * Real affiliate/referral links pending — never fabricated. Kept the same
 * visual weight as SocialSection (not hidden or minimized) so it's clearly
 * a placeholder waiting for real data, not a section nobody bothered with.
 */
export function BookmakersSection() {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-card/20 p-6 sm:p-8">
      <h3 className="text-lg font-semibold text-foreground">Les bookmakers que j&apos;utilise</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Liens de parrainage à venir — cette section sera complétée avec mes codes d&apos;affiliation réels dès qu&apos;ils
        seront prêts.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Reveal key={i} delay={i * 0.05}>
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/60 bg-background/30 p-4 text-muted-foreground">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary/40">
                <Landmark className="h-4.5 w-4.5" />
              </span>
              <span className="text-sm">Emplacement réservé</span>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
