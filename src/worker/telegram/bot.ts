import { Bot } from "grammy";
import { db } from "@/lib/db";
import { getActiveEntitlements } from "@/lib/guards";
import { consumeTelegramLinkToken } from "./linking";

/**
 * Command surface from spec section 8. `/trial` is intentionally omitted —
 * whether a trial period exists at all is still an open product decision
 * (section 20, Q7); add it once that's confirmed instead of guessing a
 * duration. `/settings` is used rather than `/edit` — also still open, easy
 * to alias later with `bot.command("edit", ...)` pointing at the same
 * handler once BotFather naming is finalized.
 */

function siteUrl(path = ""): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "https://oddshunter98.netlify.app"}${path}`;
}

async function findLinkedUserId(telegramChatId: string): Promise<string | null> {
  const link = await db.telegramLink.findUnique({ where: { telegramChatId } });
  return link && !link.revokedAt ? link.userId : null;
}

export function createBot(): Bot {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN n'est pas configuré — crée le bot via @BotFather puis ajoute le token via `stripe projects`.",
    );
  }

  const bot = new Bot(token);

  bot.command("start", async (ctx) => {
    const payloadToken = ctx.match?.toString().trim();
    const chatId = String(ctx.chat.id);

    if (payloadToken) {
      const result = await consumeTelegramLinkToken(db, payloadToken, chatId, ctx.from?.username);
      if (result.ok) {
        await ctx.reply("✅ Ton compte Odds Hunter est lié. Tu recevras les signaux ici dès qu'ils seront activés.");
        return;
      }
      const reasons: Record<typeof result.reason, string> = {
        not_found: "Ce lien n'est pas valide.",
        expired: "Ce lien a expiré (valable 15 minutes) — régénère-le depuis ton compte.",
        already_used: "Ce lien a déjà été utilisé.",
      };
      await ctx.reply(`❌ ${reasons[result.reason]} Génère un nouveau lien depuis ${siteUrl("/account")}.`);
      return;
    }

    await ctx.reply(
      `Bienvenue sur Odds Hunter 🎯\n\nPour lier ce compte Telegram à ton abonnement, ouvre ${siteUrl(
        "/account",
      )} et clique sur "Lier mon compte Telegram".\n\n/help pour la liste des commandes.`,
    );
  });

  bot.command("subscribe", async (ctx) => {
    await ctx.reply(`Abonnement Bot automatisé (75€/mois) : ${siteUrl("/#abonnement")}`);
  });

  bot.command("status", async (ctx) => {
    const userId = await findLinkedUserId(String(ctx.chat.id));
    if (!userId) {
      await ctx.reply(`Compte non lié. Ouvre ${siteUrl("/account")} pour le lier.`);
      return;
    }
    const active = await getActiveEntitlements(userId);
    const botActive = active.has("BOT");
    await ctx.reply(
      [
        `Compte : lié ✅`,
        `Abonnement Bot : ${botActive ? "actif ✅" : "inactif ❌"}`,
        botActive ? "" : `Réactive-le sur ${siteUrl("/account")}.`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  });

  bot.command(["settings", "edit"], async (ctx) => {
    const userId = await findLinkedUserId(String(ctx.chat.id));
    if (!userId) {
      await ctx.reply(`Compte non lié. Ouvre ${siteUrl("/account")} pour le lier.`);
      return;
    }
    const rules = await db.alertRule.findMany({ where: { userId, enabled: true } });
    if (rules.length === 0) {
      await ctx.reply(
        "Aucun filtre configuré pour l'instant — tu recevras tous les signaux autorisés par ton abonnement.\n" +
          "La gestion fine des filtres (sport, cote min/max, score minimal…) arrive dans une prochaine version.",
      );
      return;
    }
    const lines = rules.map((r) => `• ${r.name} — ${r.condition} ≥ ${r.threshold}${r.sport ? ` (${r.sport})` : ""}`);
    await ctx.reply(`Tes filtres actifs :\n${lines.join("\n")}`);
  });

  bot.command("history", async (ctx) => {
    const userId = await findLinkedUserId(String(ctx.chat.id));
    if (!userId) {
      await ctx.reply(`Compte non lié. Ouvre ${siteUrl("/account")} pour le lier.`);
      return;
    }
    const deliveries = await db.signalDelivery.findMany({
      where: { userId, channel: "TELEGRAM" },
      orderBy: { sentAt: "desc" },
      take: 10,
      include: { signal: true },
    });
    if (deliveries.length === 0) {
      await ctx.reply("Aucune alerte reçue pour l'instant.");
      return;
    }
    const lines = deliveries.map(
      (d) => `• ${d.sentAt.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} — ${d.signal.type} (score ${d.signal.score})`,
    );
    await ctx.reply(`Tes 10 dernières alertes :\n${lines.join("\n")}`);
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      [
        "/start — accueil et liaison du compte",
        "/subscribe — voir l'abonnement Bot",
        "/settings — voir tes filtres",
        "/status — état de ton compte et de l'abonnement",
        "/history — tes 10 dernières alertes",
        "/help — cette liste",
      ].join("\n"),
    );
  });

  return bot;
}
