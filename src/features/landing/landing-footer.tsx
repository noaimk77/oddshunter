import Link from "next/link";
import { Mail, X } from "lucide-react";
import { Wordmark } from "@/components/shared/wordmark";
import { TelegramIcon, InstagramIcon, TikTokIcon, YouTubeIcon } from "./social-icons";

const SOCIALS = [
  { name: "Telegram", href: "https://t.me/oddshunter98", Icon: TelegramIcon },
  { name: "Instagram", href: "https://www.instagram.com/odds.hunter98/", Icon: InstagramIcon },
  { name: "TikTok", href: "https://www.tiktok.com/@odds.hunter98", Icon: TikTokIcon },
  { name: "X", href: "https://x.com/odds_hunter98", Icon: X },
  { name: "YouTube", href: "https://www.youtube.com/@odds.hunter98", Icon: YouTubeIcon },
  { name: "Email", href: "mailto:oddshunter98@gmail.com", Icon: Mail },
];

export function LandingFooter() {
  return (
    <footer className="relative border-t border-border/70 bg-card/20">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <Wordmark />
          <div className="flex items-center gap-2.5">
            {SOCIALS.map(({ name, href, Icon }) => (
              <a
                key={name}
                href={href}
                target={href.startsWith("mailto:") ? undefined : "_blank"}
                rel={href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
                aria-label={name}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/30 hover:text-gold hover:shadow-[0_4px_12px_-4px_rgba(245,184,0,0.15)]"
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>

        <div className="mt-10 space-y-3 border-t border-border/50 pt-8 text-xs leading-relaxed text-muted-foreground/80">
          <p>
            <strong className="text-foreground">18+.</strong> Les paris sportifs comportent des risques : ne misez que ce que vous pouvez
            vous permettre de perdre. En cas de difficulté, contactez{" "}
            <a href="https://www.joueurs-info-service.fr" target="_blank" rel="noopener noreferrer" className="underline transition-colors hover:text-foreground">
              joueurs-info-service.fr
            </a>{" "}
            (09 74 75 13 13, appel non surtaxé).
          </p>
          <p>
            Odds Hunter fournit des informations et analyses statistiques à titre indicatif. Aucun contenu de ce site ne constitue un
            conseil financier ou une garantie de gains — les performances passées ne préjugent pas des résultats futurs.
          </p>
          <p>
            Certains liens présents sur ce site (notamment vers des bookmakers) sont des liens d&apos;affiliation ou de parrainage : ils
            peuvent générer une commission pour Odds Hunter sans coût supplémentaire pour vous, et n&apos;influencent pas le contenu
            présenté.
          </p>
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Odds Hunter. Tous droits réservés.</p>
            <Link href="/mentions-legales" className="underline transition-colors hover:text-foreground">
              Mentions légales
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
