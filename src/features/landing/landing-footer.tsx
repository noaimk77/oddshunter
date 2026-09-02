import Link from "next/link";
import { Mail, X } from "lucide-react";
import { Wordmark } from "@/components/shared/wordmark";
import { TelegramIcon, InstagramIcon, TikTokIcon, YouTubeIcon } from "./social-icons";
import type { Dictionary } from "@/i18n/dictionaries/fr";

const SOCIALS = [
  { name: "Telegram", href: "https://t.me/oddshunter98", Icon: TelegramIcon },
  { name: "Instagram", href: "https://www.instagram.com/odds.hunter98/", Icon: InstagramIcon },
  { name: "TikTok", href: "https://www.tiktok.com/@odds.hunter98", Icon: TikTokIcon },
  { name: "X", href: "https://x.com/odds_hunter98", Icon: X },
  { name: "YouTube", href: "https://www.youtube.com/@odds.hunter98", Icon: YouTubeIcon },
  { name: "Email", href: "mailto:oddshunter98@gmail.com", Icon: Mail },
];

export function LandingFooter({ t }: { t: Dictionary["footer"] }) {
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
            <strong className="text-foreground">{t.disclaimerAge}</strong> {t.disclaimer1a}{" "}
            <a href="https://www.joueurs-info-service.fr" target="_blank" rel="noopener noreferrer" className="underline transition-colors hover:text-foreground">
              joueurs-info-service.fr
            </a>{" "}
            {t.disclaimer1b}
          </p>
          <p>{t.disclaimer2}</p>
          <p>{t.disclaimer3}</p>
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Odds Hunter. {t.rights}</p>
            <Link href="/mentions-legales" className="underline transition-colors hover:text-foreground">
              {t.legalMentions}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
