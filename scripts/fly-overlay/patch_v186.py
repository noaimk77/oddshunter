"""Overlay v186: free channel, 1xBet every 3 days + new Monday note.

Applies on top of the production v185 files (freeChannel.ts, its test and
worker/index.ts). Usage: python3 patch_v186.py <root>

- the evening filler (1xBet + video, every evening with nothing else posted)
  becomes a 1xBet message every 3 days around 19:00 Paris, rotating through
  4 HTML texts written by Noaim (2026-10-28), never before 2026-10-31;
- the Monday note lists every VIP pick won the week before, one line each,
  and ends with the VIP sign-up link.
"""
import sys
root = sys.argv[1]


def patch(rel, edits, marker):
    p = f"{root}/{rel}"
    s = open(p).read()
    if marker in s:
        sys.exit(f"{rel}: already patched")
    for old, new in edits:
        n = s.count(old)
        if n != 1:
            sys.exit(f"{rel}: expected 1 match, found {n} for {old[:60]!r}")
        s = s.replace(old, new)
    open(p, "w").write(s)
    print("patched", rel)


patch("src/worker/telegram/freeChannel.ts", [
    (""" *  - on Mondays, instead of the daily message: a "good week" note with every
 *    win of the week before (Noaim 2026-10-06).
""", """ *  - on Mondays: every VIP pick won the week before, one line each, then the
 *    VIP link (Noaim 2026-10-06, format of 2026-10-28).
"""),
    (""" *  - in the evening, if nothing else went out that day: his 1xBet link and
 *    the tutorial video, so the channel never looks dead (Noaim 2026-10-16).
""", """ *  - every 3 days around 19:00: his 1xBet link and the tutorial video
 *    (Noaim 2026-10-28; it was every evening before).
"""),
    ("""/** Every variant says "semaine": that word is how a restart recognises the
 *  Monday message as already posted (see maybeSendDailyRecap). */
export const WEEKLY_TEMPLATES: readonly string[] = [
  "Bon début de semaine à tous 👋\\nCe qui est passé dans le VIP la semaine dernière :\\n\\n{lignes}",
  "Nouvelle semaine, on repart 💪\\nLes pronos VIP validés la semaine dernière 👇\\n\\n{lignes}",
  "Bon lundi la team 👋 Petit retour sur la semaine passée dans le VIP :\\n\\n{lignes}",
];
const WEEKLY_EMPTY_TEMPLATES: readonly string[] = [
  "Bon début de semaine à tous 👋 On repart.",
  "Nouvelle semaine, on s'y remet 💪 Bon lundi à tous.",
];
""", """/** First line of the Monday note: how a restart recognises it as already
 *  posted (see maybeSendDailyRecap). */
export const WEEKLY_HEADER = "Les pronos VIP validés la semaine dernière 👇";
export const VIP_SIGNUP_URL = "https://oddshunter98.vercel.app/abonnement";
"""),
    ("""  return {
    match: `${home} - ${away}`,
""", """  return {
    home,
    away,
    match: `${home} - ${away}`,
"""),
    ("""/** Monday note: the greeting alone when nothing won the week before. */
export function formatWeeklyRecap(alerts: WonAlert[], variant: number, ctaUrl?: string | null): string {
  const lines = alerts
    .map(fields)
    .filter((f): f is Record<string, string> => f !== null)
    .map((f) => render("✅ {match} : {pick}[ ({cote})]", f));
  if (lines.length === 0) return WEEKLY_EMPTY_TEMPLATES[variant % WEEKLY_EMPTY_TEMPLATES.length];
  return render(WEEKLY_TEMPLATES[variant % WEEKLY_TEMPLATES.length], { lignes: lines.join("\\n") }) + cta(alerts[0].id + "weekly", ctaUrl);
}
""", """/** Monday note: one line per pick won the week before; null when none. */
export function formatWeeklyRecap(alerts: WonAlert[]): string | null {
  const lines = alerts
    .map(fields)
    .filter((f): f is Record<string, string> => f !== null)
    .map((f) => render("✅ {home} vs {away} | {pick}[ @{cote}]", f));
  if (lines.length === 0) return null;
  return `${WEEKLY_HEADER}\\n\\n${lines.join("\\n")}\\n\\nLe VIP c'est par ici 👉 ${VIP_SIGNUP_URL}`;
}
"""),
    ("""type Send = (text: string) => Promise<void>;""",
     """/** `html`: Telegram HTML with the link preview on (the 1xBet message). */
type Send = (text: string, opts?: { html?: boolean }) => Promise<void>;"""),
    ("""      const already = postedSince ? (await postedSince(week.end)).some((text) => /semaine/i.test(text)) : false;
      if (!already) {
        const winners = await db.consensusAlert.findMany({
          where: { outcome: "WON", sentMessageId: { not: null }, resolvedAt: { gte: week.start, lt: week.end } },
          orderBy: { resolvedAt: "asc" },
        });
        await send(formatWeeklyRecap(winners, pickVariant(dayKey, WEEKLY_TEMPLATES.length), FREE_CHANNEL_CTA_URL));
      }
""", """      const already = postedSince ? (await postedSince(week.end)).some((text) => text.startsWith(WEEKLY_HEADER)) : false;
      if (!already) {
        const winners = await db.consensusAlert.findMany({
          where: { outcome: "WON", sentMessageId: { not: null }, resolvedAt: { gte: week.start, lt: week.end } },
          orderBy: { resolvedAt: "asc" },
        });
        const text = formatWeeklyRecap(winners);
        if (text) await send(text);
      }
"""),
    ("""// ── Evening filler (Noaim 2026-10-16: "un message par jour au moins") ──

/** His own wording (2026-10-06): "pour tous ceux qui veulent suivre mes paris…". */
export const FILLER_TEMPLATES: readonly string[] = [
  "Pour tous ceux qui veulent suivre mes paris sur les meilleurs bookmakers, installez 1xBet 👇\\n{aff}\\n\\nLe tuto pour s'inscrire : {video}",
  "Vous me demandez souvent sur quel site je joue 👉 1xBet\\n{aff}\\n\\nJ'ai fait une vidéo pour l'installer et s'inscrire : {video}",
  "Pour ceux qui veulent jouer les pronos avec moi, c'est sur 1xBet que ça se passe\\n{aff}\\n\\nTout est expliqué ici 👇\\n{video}",
];
const FILLER_HOUR = 20;

export function formatFiller(variant: number): string {
  return render(FILLER_TEMPLATES[variant % FILLER_TEMPLATES.length], { aff: FREE_CHANNEL_AFFILIATE_URL, video: FREE_CHANNEL_VIDEO_URL });
}

let fillerDoneForDay: string | undefined;

/** ~20:00 Paris: posts the filler only when the channel got nothing since
 *  midnight. The channel history is the record, so a restart can't double it. */
export async function maybeSendFiller(send: Send, now: Date = new Date(), postedSince?: PostedSince): Promise<boolean> {
  const { y, m, d } = parisParts(now);
  const dayKey = `${y}-${m}-${d}`;
  if (fillerDoneForDay === dayKey || now < dailyRecapDueAt(now, FILLER_HOUR)) return false;
  try {
    const postedToday = postedSince ? (await postedSince(parisWallToUtc(y, m, d))).length > 0 : false;
    if (!postedToday) await send(formatFiller(pickVariant(dayKey + "filler", FILLER_TEMPLATES.length)));
    fillerDoneForDay = dayKey;
    return !postedToday;
  } catch (err) {
    console.error("[freeChannel] filler failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
""", """// ── 1xBet message, every 3 days (Noaim 2026-10-28) ─────────────────────

const TUTO_URL = "https://youtu.be/W2XIexkPxtg";
const AFF_HREF = FREE_CHANNEL_AFFILIATE_URL.replace(/&/g, "&amp;");

/** His texts, posted in this order. Telegram previews the first link, so the
 *  tutorial must stay the first one: the preview is the video. */
export const ONEXBET_TEMPLATES: readonly string[] = [
  `🚨 Tous les pronos du canal sont jouables sur <b>1XBET</b>\\n\\n✔️ Pour <b>ouvrir ton compte</b> facilement et <b>télécharger l'application mobile</b>, j'ai fait un tuto complet sur YouTube 📲👇\\n${TUTO_URL}\\n\\n🔗 Inscription ici 👉 <a href="${AFF_HREF}">créer mon compte 1XBET</a>`,
  `📲 Pas encore de compte <b>1XBET</b> ?\\n\\nTout est expliqué dans le tuto 👇\\n${TUTO_URL}\\n\\n🔗 <a href="${AFF_HREF}">créer mon compte 1XBET</a>`,
  `⚽ Les cotes qu'on joue ici, je les prends sur <b>1XBET</b>\\n\\nInscription + appli mobile en vidéo 👇\\n${TUTO_URL}\\n\\n👉 <a href="${AFF_HREF}">créer mon compte 1XBET</a>`,
  `🎥 Le tuto <b>1XBET</b> est toujours dispo\\n\\nCompte + appli en quelques minutes 👇\\n${TUTO_URL}\\n\\n🔗 Inscription : <a href="${AFF_HREF}">créer mon compte 1XBET</a>`,
];
const ONEXBET_HOUR = 19;
const ONEXBET_GAP_DAYS = 3;
/** He posted text A by hand on 2026-10-28: nothing automatic before the 31st. */
const ONEXBET_FIRST_DAY = Date.UTC(2026, 9, 31);
const DAY_MS = 24 * 3600_000;

/** Which template a channel post is (plain text, tags gone); -1 for anything
 *  else, such as the old evening filler. */
export function onexbetVariantOf(text: string): number {
  return ONEXBET_TEMPLATES.findIndex((t) => text.startsWith(t.split("\\n")[0].replace(/<[^>]+>/g, "")));
}

/** Latest 1xBet post on the channel, whoever posted it. */
export type Last1xbet = () => Promise<{ at: Date; text: string } | null>;

let onexbetCheckedForDay: string | undefined;
/** Last one sent by this process: the fallback when the channel can't be read. */
let lastOnexbet: { day: number; variant: number } | undefined;

/**
 * ~19:00 Paris, when the last 1xBet post is 3 calendar days old or more:
 * posts the template after that one (A after D, or after anything else).
 * No table for this: the date and the text of the last post are read back
 * from the channel, so redeploys and posts made by hand both count.
 */
export async function maybeSend1xbet(send: Send, now: Date = new Date(), last?: Last1xbet): Promise<boolean> {
  const { y, m, d } = parisParts(now);
  const dayKey = `${y}-${m}-${d}`;
  const today = Date.UTC(y, m - 1, d);
  if (onexbetCheckedForDay === dayKey || today < ONEXBET_FIRST_DAY || now < dailyRecapDueAt(now, ONEXBET_HOUR)) return false;
  try {
    const post = last ? await last() : null;
    const p = post ? parisParts(post.at) : null;
    const prev = post && p ? { day: Date.UTC(p.y, p.m - 1, p.d), variant: onexbetVariantOf(post.text) } : lastOnexbet;
    if (prev && today - prev.day < ONEXBET_GAP_DAYS * DAY_MS) {
      onexbetCheckedForDay = dayKey;
      return false;
    }
    const variant = prev ? (prev.variant + 1) % ONEXBET_TEMPLATES.length : 0;
    await send(ONEXBET_TEMPLATES[variant], { html: true });
    lastOnexbet = { day: today, variant };
    onexbetCheckedForDay = dayKey;
    return true;
  } catch (err) {
    console.error("[freeChannel] 1xBet message failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
"""),
    ("""    return async (text) => {
      await client.sendMessage(TELEGRAM_FREE_CHANNEL, { message: text, linkPreview: false });
    };
""", """    return async (text, opts) => {
      await client.sendMessage(
        TELEGRAM_FREE_CHANNEL,
        opts?.html ? { message: text, parseMode: "html", linkPreview: true } : { message: text, linkPreview: false },
      );
    };
"""),
    ("""/** Reads the free channel's recent posts back; null in dry run (nothing public to read). */""",
     """/** Latest 1xBet post (the tutorial link is in every version, old filler included); undefined in dry run. */
export function freeChannelLast1xbet(client: TelegramClient): Last1xbet | undefined {
  if (!SEND_FREE_CHANNEL_POSTS) return undefined;
  return async () => {
    const found = await client.getMessages(TELEGRAM_FREE_CHANNEL, { search: "1xbet", limit: 20 });
    const msg = found.find((x) => (x.message ?? "").includes("W2XIexkPxtg"));
    return msg ? { at: new Date(msg.date * 1000), text: msg.message ?? "" } : null;
  };
}

/** Reads the free channel's recent posts back; null in dry run (nothing public to read). */"""),
    ("""  FREE_CHANNEL_VIDEO_URL,
""", ""),
], "maybeSend1xbet")

patch("src/worker/index.ts", [
    ("""import { freeChannelPostedSince, freeChannelSender, maybeSendDailyRecap, maybeSendFiller, maybeSendStreakPromo } from "./telegram/freeChannel";""",
     """import { freeChannelLast1xbet, freeChannelPostedSince, freeChannelSender, maybeSend1xbet, maybeSendDailyRecap, maybeSendStreakPromo } from "./telegram/freeChannel";"""),
    ("""      // Free public channel: Monday note, streak promo, evening filler. Won""",
     """      // Free public channel: Monday note, streak promo, 1xBet every 3 days. Won"""),
    ("""          const filler = await maybeSendFiller(freeSend, new Date(), tipUserClient ? freeChannelPostedSince(tipUserClient) : undefined);
          if (daily || promo || filler) console.log(`[worker] free channel: monday note ${daily ? "sent" : "no"}, streak promo ${promo ? "sent" : "no"}, filler ${filler ? "sent" : "no"}.`);""",
     """          const onexbet = await maybeSend1xbet(freeSend, new Date(), tipUserClient ? freeChannelLast1xbet(tipUserClient) : undefined);
          if (daily || promo || onexbet) console.log(`[worker] free channel: monday note ${daily ? "sent" : "no"}, streak promo ${promo ? "sent" : "no"}, 1xbet ${onexbet ? "sent" : "no"}.`);"""),
], "maybeSend1xbet")

patch("src/worker/telegram/freeChannel.test.ts", [
    ("""  FILLER_TEMPLATES,
  formatFiller,
""", """  ONEXBET_TEMPLATES,
  WEEKLY_HEADER,
  formatWeeklyRecap,
  maybeSend1xbet,
  onexbetVariantOf,
"""),
    ("""  maybeSendFiller,
""", ""),
    ("""    expect(sent[0]).toMatch(/semaine/i);
""", """    expect(sent[0].startsWith(WEEKLY_HEADER)).toBe(true);
    expect(sent[0]).toContain("✅ Lundi FC vs Salernitana | Plus de 1,5 but");
    expect(sent[0]).toContain(" @1.72");
    expect(sent[0].endsWith("Le VIP c'est par ici 👉 https://oddshunter98.vercel.app/abonnement")).toBe(true);
"""),
    ("""async () => ["Bon début de semaine à tous 👋 On repart."])).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });
""", """async () => [`${WEEKLY_HEADER}\\n\\n✅ A vs B | 1 @1.80`])).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it("une ligne par prono, sans cote si inconnue ; rien quand aucun gagnant", () => {
    const out = formatWeeklyRecap([base, { ...base, id: "a2", homeTeam: "Bari", awayTeam: "Pisa", oddsAtAlert: null }])!;
    expect(out.split("\\n").filter((l) => l.startsWith("✅"))).toHaveLength(2);
    expect(out).toMatch(/✅ Bari vs Pisa \\| [^@\\n]+\\n/);
    expect(out).not.toMatch(/[{}[\\]]|undefined|null|NaN/);
    expect(formatWeeklyRecap([])).toBeNull();
  });

  it("lundi sans gagnant la semaine passée : rien n'est posté", async () => {
    const send = vi.fn(async () => {});
    expect(await maybeSendDailyRecap(fakeDb([]), send, new Date("2026-10-26T10:00:00Z"), async () => [])).toBe(true); // 11:00 Paris
    expect(send).not.toHaveBeenCalled();
  });
"""),
    ("""describe("message du soir (1xBet + vidéo)", () => {
  it.each(FILLER_TEMPLATES.map((_, i) => i))("gabarit %i : lien 1xBet et vidéo, pas de placeholder", (i) => {
    const out = formatFiller(i);
    expect(out).toContain("reffpa.com");
    expect(out).toContain("youtube.com");
    expect(out).not.toMatch(/[{}[\\]]|undefined|null/);
  });

  it("rien de posté aujourd'hui : envoie ; déjà un message aujourd'hui : n'envoie pas", async () => {
    const evening = new Date("2026-10-20T19:00:00Z"); // 21:00 Paris
    const send = vi.fn(async () => {});
    expect(await maybeSendFiller(send, evening, async () => ["Hier dans le VIP ✅"])).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(await maybeSendFiller(send, new Date("2026-10-21T19:00:00Z"), async () => [])).toBe(true);
    expect(send).toHaveBeenCalledOnce();
  });

  it("pas avant 20h", async () => {
    const send = vi.fn(async () => {});
    expect(await maybeSendFiller(send, new Date("2026-10-22T10:00:00Z"), async () => [])).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
""", """describe("message 1xBet tous les 3 jours", () => {
  const AFF = 'href="https://reffpa.com/L?tag=d_5964613m_4098c_&amp;site=5964613&amp;ad=4098"';

  it.each(ONEXBET_TEMPLATES.map((_, i) => i))("texte %i : tuto en premier lien, lien d'affiliation, jamais le site 1xBet", (i) => {
    const t = ONEXBET_TEMPLATES[i];
    expect(t).toContain(AFF);
    expect(t.indexOf("https://youtu.be/W2XIexkPxtg")).toBeLessThan(t.indexOf("href="));
    expect(t).not.toMatch(/1xbet\\.(com|fr)/i);
    expect(onexbetVariantOf(t.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&"))).toBe(i);
  });

  // L'état du module est partagé : les dates avancent d'un test à l'autre.
  const at19 = (day: number) => new Date(Date.UTC(2026, 9, day, 18, 30)); // 19:30 Paris (heure d'hiver)
  const post = (day: number, i: number) => async () => ({ at: new Date(Date.UTC(2026, 9, day, 17)), text: ONEXBET_TEMPLATES[i].replace(/<[^>]+>/g, "") });

  it("rien avant le 31/10, même sans trace sur le canal", async () => {
    const send = vi.fn(async () => {});
    expect(await maybeSend1xbet(send, at19(30), async () => null)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("31/10 : 3 jours après le A posté à la main le 28 → B à 19h, pas avant", async () => {
    const send = vi.fn(async () => {});
    expect(await maybeSend1xbet(send, new Date(Date.UTC(2026, 9, 31, 16)), post(28, 0))).toBe(false);
    expect(await maybeSend1xbet(send, at19(31), post(28, 0))).toBe(true);
    expect(send).toHaveBeenCalledWith(ONEXBET_TEMPLATES[1], { html: true });
    expect(await maybeSend1xbet(send, new Date(Date.UTC(2026, 9, 31, 20)), post(28, 0))).toBe(false);
    expect(send).toHaveBeenCalledOnce();
  });

  it("moins de 3 jours après le dernier : rien ; après D vient A", async () => {
    const send = vi.fn(async () => {});
    expect(await maybeSend1xbet(send, new Date(Date.UTC(2026, 10, 2, 18, 30)), post(31, 1))).toBe(false);
    expect(await maybeSend1xbet(send, new Date(Date.UTC(2026, 10, 5, 18, 30)), async () => ({ at: new Date(Date.UTC(2026, 10, 2, 18)), text: ONEXBET_TEMPLATES[3] }))).toBe(true);
    expect(send).toHaveBeenCalledWith(ONEXBET_TEMPLATES[0], { html: true });
  });

  it("canal illisible : se fie au dernier envoi de ce process", async () => {
    const send = vi.fn(async () => {});
    expect(await maybeSend1xbet(send, new Date(Date.UTC(2026, 10, 7, 18, 30)), async () => null)).toBe(false);
    expect(await maybeSend1xbet(send, new Date(Date.UTC(2026, 10, 8, 18, 30)))).toBe(true);
    expect(send).toHaveBeenCalledWith(ONEXBET_TEMPLATES[1], { html: true });
  });
"""),
], "maybeSend1xbet")
