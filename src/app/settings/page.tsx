import { Globe, Moon } from "lucide-react";
import { auth } from "@/lib/auth";
import { requireAuth } from "@/lib/guards";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { Switch } from "@/components/ui/switch";
import { LandingHeader } from "@/features/landing/landing-header";
import { getLocale } from "@/i18n/get-locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { LandingFooter } from "@/features/landing/landing-footer";
import { LanguageSetting } from "@/features/settings/language-setting";

function SettingRow({
  icon: Icon,
  title,
  description,
  control,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary/60 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export default async function SettingsPage() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  await requireAuth();
  const session = await auth();
  const s = dict.settings;

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader isAuthenticated={Boolean(session?.user)} locale={locale} t={dict.nav} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <PageHeader eyebrow={s.pageTitle} title={s.pageTitle} description={s.pageDescription} />

        <div className="grid grid-cols-1 gap-4">
          <SectionCard title={s.languageTitle}>
            <SettingRow
              icon={Globe}
              title={s.languageTitle}
              description={s.languageDescription}
              control={<LanguageSetting locale={locale} />}
            />
          </SectionCard>

          <SectionCard title={s.appearanceTitle}>
            <SettingRow
              icon={Moon}
              title={s.darkModeTitle}
              description={s.darkModeDescription}
              control={<Switch defaultChecked disabled size="sm" />}
            />
          </SectionCard>
        </div>
      </main>
      <LandingFooter t={dict.footer} />
    </div>
  );
}
