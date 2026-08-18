import { Mail } from "lucide-react";
import { X } from "lucide-react";
import { TelegramIcon, InstagramIcon, TikTokIcon, YouTubeIcon } from "./social-icons";
import { Reveal } from "./reveal";
import type { Dictionary } from "@/i18n/dictionaries/fr";

export function SocialSection({ t }: { t: Dictionary["social"] }) {
  const LINKS = [
    { name: "Telegram", detail: t.channelMain, href: "https://t.me/oddshunter98", Icon: TelegramIcon, accent: true },
    { name: "Instagram", detail: "@odds.hunter98", href: "https://www.instagram.com/odds.hunter98/", Icon: InstagramIcon },
    { name: "TikTok", detail: "@odds.hunter98", href: "https://www.tiktok.com/@odds.hunter98", Icon: TikTokIcon },
    { name: "X", detail: "@odds_hunter98", href: "https://x.com/odds_hunter98", Icon: X },
    { name: "YouTube", detail: "@odds.hunter98", href: "https://www.youtube.com/@odds.hunter98", Icon: YouTubeIcon },
    { name: "Email", detail: "oddshunter98@gmail.com", href: "mailto:oddshunter98@gmail.com", Icon: Mail },
  ];

  return (
    <div className="h-full rounded-2xl border border-border/70 bg-card/40 p-6 sm:p-8">
      <h3 className="text-lg font-bold text-foreground">{t.sectionTitle}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{t.sectionSubtitle}</p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map(({ name, detail, href, Icon, accent }, i) => (
          <Reveal key={name} delay={i * 0.04}>
            <a
              href={href}
              target={href.startsWith("mailto:") ? undefined : "_blank"}
              rel={href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
              className={
                "group relative flex items-center gap-3 overflow-hidden rounded-xl border p-4 transition-all duration-300 hover:-translate-y-1 " +
                (accent
                  ? "border-gold/30 bg-gold/[0.04] hover:border-gold/50 hover:shadow-[0_12px_32px_-12px_rgba(245,184,0,0.3)]"
                  : "border-border/70 bg-background/40 hover:border-border hover:bg-background/70 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)]")
              }
            >
              <span
                className={
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-all duration-300 group-hover:scale-110 " +
                  (accent ? "bg-gold/15 text-gold" : "bg-secondary/60 text-muted-foreground group-hover:text-foreground")
                }
              >
                <Icon className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{name}</span>
                <span className="block truncate text-xs text-muted-foreground">{detail}</span>
              </span>
            </a>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
