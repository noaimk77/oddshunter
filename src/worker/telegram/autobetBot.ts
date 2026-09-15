import { Bot } from "grammy";

/**
 * Private bot — Noaim's own dashboard/remote-control for the auto-betting
 * pipeline (PS3838 / Polymarket), never public. Separate bot token and
 * separate process from the VIP signals bot (./bot.ts) since they serve
 * unrelated audiences and a leaked token here has real-money consequences.
 * Every handler checks AUTOBET_ADMIN_CHAT_ID and silently ignores anyone
 * else — there's no legitimate second user, so no user-facing rejection
 * message either.
 */

function isAdmin(chatId: number): boolean {
  const adminChatId = process.env.AUTOBET_ADMIN_CHAT_ID;
  return !!adminChatId && String(chatId) === adminChatId;
}

export function createAutobetBot(): Bot {
  const token = process.env.AUTOBET_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "AUTOBET_BOT_TOKEN n'est pas configuré — crée le bot via @BotFather puis ajoute le token en secret Fly.",
    );
  }
  if (!process.env.AUTOBET_ADMIN_CHAT_ID) {
    throw new Error("AUTOBET_ADMIN_CHAT_ID n'est pas configuré — le bot ne saurait à qui répondre.");
  }

  const bot = new Bot(token);

  bot.use(async (ctx, next) => {
    if (!ctx.chat || !isAdmin(ctx.chat.id)) return;
    await next();
  });

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "🤖 Autobet en ligne.\n\nCommandes disponibles pour l'instant :\n/solde — voir la bankroll\n\n" +
        "PS3838 et Polymarket ne sont pas encore branchés — étape suivante.",
    );
  });

  // Placeholder — renverra le vrai solde PS3838 + Polymarket une fois les
  // deux clients écrits. Répond dès maintenant pour valider le câblage
  // bot -> secrets -> déploiement avant d'ajouter la logique métier.
  bot.command("solde", async (ctx) => {
    await ctx.reply("Solde : pas encore connecté à PS3838 ni Polymarket.");
  });

  return bot;
}
