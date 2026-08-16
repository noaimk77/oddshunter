import { Mail } from "lucide-react";
import { X } from "lucide-react";
import { TelegramIcon, InstagramIcon, TikTokIcon, YouTubeIcon } from "./social-icons";
import { Reveal } from "./reveal";

const LINKS = [
  { name: "Telegram", detail: "Canal principal", href: "https://t.me/oddshunter98", Icon: TelegramIcon, accent: true },
  { name: "Instagram", detail: "@odds.hunter98", href: "https://www.instagram.com/odds.hunter98/", Icon: InstagramIcon },
  { name: "TikTok", detail: "@odds.hunter98", href: "https://www.tiktok.com/@odds.hunter98", Icon: TikTokIcon },
  { name: "X", detail: "@odds_hunter98", href: "https://x.com/odds_hunter98", Icon: X },
  { name: "YouTube", detail: "@odds.hunter98", href: "https://www.youtube.com/@odds.hunter98", Icon: YouTubeIcon },
  { name: "Email", detail: "oddshunter98@gmail.com", href: "mailto:oddshunter98@gmail.com", Icon: Mail },
];

export function SocialSection() {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/40 p-6 sm:p-8">
      <h3 className="text-lg font-semibold text-foreground">Réseaux sociaux</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Le canal Telegram est le point de contact principal. Le reste, c&apos;est pour suivre le quotidien.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map(({ name, detail, href, Icon, accent }, i) => (
          <Reveal key={name} delay={i * 0.05}>
            <a
              href={href}
              target={href.startsWith("mailto:") ? undefined : "_blank"}
              rel={href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
              className={
                "group flex items-center gap-3 rounded-xl border p-4 transition-all hover:-translate-y-0.5 " +
                (accent
                  ? "border-gold/30 bg-gold/[0.05] hover:border-gold/50 hover:shadow-[0_10px_28px_-14px_rgba(212,175,55,0.4)]"
                  : "border-border/70 bg-background/40 hover:border-border hover:bg-background/70")
              }
            >
              <span
                className={
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-110 " +
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
