import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MotionConfig } from "framer-motion";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getLocale } from "@/i18n/get-locale";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://oddshunter98.netlify.app"),
  title: {
    default: "Oddshunter",
    template: "%s — Oddshunter",
  },
  description: "Rejoins le groupe VIP ou le bot Oddshunter pour suivre les signaux partagés en direct.",
  applicationName: "Oddshunter",
  keywords: ["Oddshunter", "Odds Hunter", "mouvements de cotes", "signaux sportifs", "bot cotes", "Telegram VIP"],
  creator: "Oddshunter",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: "/",
    siteName: "Oddshunter",
    title: "Oddshunter — Signaux et mouvements de cotes",
    description: "Groupe VIP et bot automatisé pour suivre les mouvements de cotes et recevoir les signaux Oddshunter.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Oddshunter — Signaux et mouvements de cotes",
    description: "Suis les signaux Oddshunter via le groupe VIP ou le bot automatisé.",
    images: ["/opengraph-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#050505",
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://oddshunter98.netlify.app/#organization",
      name: "Oddshunter",
      alternateName: "Odds Hunter",
      url: "https://oddshunter98.netlify.app/",
      logo: "https://oddshunter98.netlify.app/icon.png",
      sameAs: [
        "https://t.me/oddshunter98",
        "https://www.instagram.com/odds.hunter98/",
        "https://www.tiktok.com/@odds.hunter98",
        "https://x.com/odds_hunter98",
        "https://www.youtube.com/@odds.hunter98",
      ],
    },
    {
      "@type": "WebSite",
      "@id": "https://oddshunter98.netlify.app/#website",
      name: "Oddshunter",
      alternateName: "Odds Hunter",
      url: "https://oddshunter98.netlify.app/",
      publisher: { "@id": "https://oddshunter98.netlify.app/#organization" },
      inLanguage: "fr-FR",
    },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();

  return (
    <html lang={locale} className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
        <MotionConfig reducedMotion="user">
          <TooltipProvider delay={200}>{children}</TooltipProvider>
        </MotionConfig>
      </body>
    </html>
  );
}
