import Anthropic from "@anthropic-ai/sdk";
import { slugTeam, type Fixture } from "./tipParser";
import { getTipLlmFallbackConfig, TIP_LLM_FALLBACK_ENABLED } from "../config";

/**
 * Last-resort tip parser. The deterministic parser in tipParser.ts refuses to
 * pick a side when a bet slip shows both cotes ("W1 1.72 W2 2.00") — that's
 * a menu, not a stated pick. But real tipsters DO post those slips as their
 * tip, with the actual pick indicated visually (highlighted button, ticked
 * checkbox, "Bet Placed" state) or in a follow-up message that the OCR
 * shreds ("Victoire de Boca @1.72" reduced to "€ce OS VS Academy | ..." by
 * Tesseract). We hand text + image to Claude and let it read the slip like
 * a human would. Only fires when a fixture is already known so the model
 * has an anchor to reason about, and only when explicitly enabled.
 */

let clientPromise: Promise<Anthropic | null> | null = null;

function getClient(): Promise<Anthropic | null> {
  if (!clientPromise) {
    clientPromise = (async () => {
      if (!TIP_LLM_FALLBACK_ENABLED) return null;
      const { apiKey, workspaceId } = getTipLlmFallbackConfig();
      if (!apiKey) {
        console.warn("[tipLlmFallback] TIP_LLM_FALLBACK_ENABLED=true but ANTHROPIC_API_KEY is missing — fallback disabled.");
        return null;
      }
      // Identity-linked / service-account API keys (the current Anthropic
      // default) require the workspace they act in to be passed on every
      // request; a plain API key won't reach the model without it.
      const defaultHeaders = workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined;
      return new Anthropic({ apiKey, defaultHeaders });
    })();
  }
  return clientPromise;
}

const LLM_TIMEOUT_MS = 15_000;

const SYSTEM_PROMPT = `Tu es un analyseur de pronostics sportifs. On te donne le texte OCR (souvent bruité) et parfois la capture d'écran d'un message posté dans un groupe de tipsters, ainsi que les deux équipes du match. Ton unique job: identifier LA SÉLECTION que le tipster met en avant.

RÈGLES:
- Si le message montre juste une grille de cotes SANS sélection mise en avant (les deux cotes affichées sans aucun indice visuel/textuel du pick), réponds {"market": null, "selection": null}.
- Une "sélection mise en avant" = surlignée, encadrée, cochée, dans un panier "coupon", "Bet slip", "ticket", "bulletin", "Placed", "Selected"; OU annoncée en toutes lettres, y compris en argot de tipster: "victoire de X", "je prends/pars sur X", "sur X", "je mets/blinde/charge X", "banker", "coup sûr", "value sur", "ça passe", "j'ai pris", "W1", "W2", "1", "2", "over/plus de 2.5", "under/moins de 3", "handicap -4.5", "les deux marquent", etc.
- Une sélection énoncée dans une phrase d'analyse compte, même sans coupon ni cote. Ex: "3-0 à la mi-temps, over 4.5 facile" => OVER_UNDER OVER_4_5. "handicap -4,5 qui passe" => HANDICAP -4.5.
- Si tu vois une seule cote sans son opposée pour le même marché, c'est le pick.
- "odds": la COTE décimale du pari sélectionné — le nombre à côté de la sélection surlignée dans le coupon (ex "1.91", "2.07"), ou celle écrite dans le texte ("cote 1.85", "@2.10"). Un nombre entre ~1.15 et ~15. Si aucune cote n'est visible, mets null. Ne confonds PAS avec une ligne de marché ("Over 2.5", "-1.5") ni un score.
- Extraire un pari RÉELLEMENT énoncé n'est pas "deviner". N'invente un pari QUE quand aucun n'est exprimé (simple discussion du match, ou grille de cotes nue).
- DIRECTION FIABLE: le sens (OVER vs UNDER, HOME vs AWAY, YES vs NO) vient du TEXTE explicite ("Over 6.5", "moins de 2", "W2"), pas d'une colonne UI. Si la légende dit "Over 6.5" et l'image montre les colonnes Over/Under côte à côte, la réponse est OVER_6_5 — jamais UNDER, même si "Under" apparaît visuellement à côté.

FORMATS DE RETOUR — JSON strict, RIEN d'autre: { "market": ..., "selection": ..., "odds": number | null }
  market: "1X2" | "OVER_UNDER" | "OVER_UNDER_HT" | "BTTS" | "DOUBLE_CHANCE" | "HANDICAP"
  selection:
    - 1X2 → slug de l'équipe gagnante (voir slug ci-dessous), ou "DRAW"
    - OVER_UNDER → "OVER_2_5", "UNDER_1_5", etc. (underscore entre entier et décimale)
    - OVER_UNDER_HT → IDENTIQUE à OVER_UNDER, mais UNIQUEMENT quand le pari vise explicitement la 1ère mi-temps ("1ère mi-temps", "1re période", "MT", "HT", "1st half") — ex "over 0.5 1ère mi-temps" => OVER_UNDER_HT OVER_0_5. Un simple rappel du score à la pause dans une analyse ne compte PAS. Une 2e mi-temps reste OVER_UNDER classique.
    - BTTS → "YES" ou "NO"
    - DOUBLE_CHANCE → "1X", "X2", "12"
    - HANDICAP → la valeur avec signe ("-1.5", "+2")

Le "slug" d'une équipe = son nom en minuscules, sans accents, sans espaces ni ponctuation (ex: "Boca Juniors" → "bocajuniors", "BORRACHEIROS" → "borracheiros").

Ajoute aussi "odds": la COTE décimale du pari sélectionné (le nombre à côté de la sélection surlignée dans le coupon, ex "1.91"; ou "cote 1.85" / "@2.10" dans le texte). Nombre entre ~1.15 et ~15, sinon null. Ne confonds PAS avec une ligne de marché ("Over 2.5") ni un score.

Si rien d'identifiable, réponds {"market": null, "selection": null, "odds": null}. Ne devine JAMAIS.

Réponds UNIQUEMENT avec le JSON, pas de markdown, pas d'explication.`;

interface LlmPick {
  market: string | null;
  selection: string | null;
  odds?: number | string | null;
}

/** The decimal odds the LLM read off the selected pick / coupon line.
 *  Kept strict — a plausible sports-betting price only (Noaim 2026-09-05:
 *  the VIP alert must SHOW a cote; regex on garbled bet-slip OCR wasn't
 *  finding one, but the model reading the screenshot can). */
export function parseLlmOdds(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 1.15 && n <= 15 ? Math.round(n * 100) / 100 : null;
}

export function normalizeSelection(market: string, selection: string, fixture: Fixture): string | null {
  const homeSlug = slugTeam(fixture.homeTeam);
  const awaySlug = slugTeam(fixture.awayTeam);
  if (market === "1X2") {
    const normalized = slugTeam(selection);
    if (normalized === homeSlug || normalized === awaySlug) return normalized;
    if (normalized === "draw" || normalized === "nul" || normalized === "x") return "DRAW";
    // Sometimes the model returns just the first name ("boca" for "bocajuniors"): match on prefix.
    if (homeSlug.startsWith(normalized) || normalized.startsWith(homeSlug)) return homeSlug;
    if (awaySlug.startsWith(normalized) || normalized.startsWith(awaySlug)) return awaySlug;
    return null;
  }
  return selection.trim().toUpperCase();
}

const ALLOWED_MARKETS = new Set(["1X2", "OVER_UNDER", "OVER_UNDER_HT", "BTTS", "DOUBLE_CHANCE", "HANDICAP"]);

/**
 * Returns `{market, selection}` on a successful parse, `null` on
 *   - fallback disabled / missing key
 *   - LLM returned {market:null,selection:null} (uncertain — treat as no pick)
 *   - any timeout, network error, or malformed JSON (best-effort by design)
 * Never throws.
 */
export async function extractSelectionWithLLM(args: {
  rawText: string;
  fixture: Fixture;
  imageBuffer?: Buffer;
}): Promise<{ market: string; selection: string; odds: number | null } | null> {
  const client = await getClient();
  if (!client) return null;

  const { rawText, fixture, imageBuffer } = args;
  const { model } = getTipLlmFallbackConfig();

  const userText = `Équipes du match: "${fixture.homeTeam}" (domicile) vs "${fixture.awayTeam}" (extérieur).
Slugs attendus: home=${slugTeam(fixture.homeTeam)}, away=${slugTeam(fixture.awayTeam)}.

Texte OCR / message brut:
"""
${rawText.slice(0, 4000)}
"""

Quelle est la sélection mise en avant ? JSON strict.`;

  const content: Anthropic.MessageParam["content"] = [];
  if (imageBuffer && imageBuffer.length > 0 && imageBuffer.length < 5 * 1024 * 1024) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: imageBuffer.toString("base64") },
    });
  }
  content.push({ type: "text", text: userText });

  let response: Anthropic.Message;
  try {
    response = await Promise.race([
      client.messages.create({
        model,
        max_tokens: 160,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("LLM timeout")), LLM_TIMEOUT_MS)),
    ]);
  } catch (err) {
    console.warn("[tipLlmFallback] call failed:", err instanceof Error ? err.message : err);
    return null;
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) return null;

  const raw = textBlock.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: LlmPick;
  try {
    parsed = JSON.parse(raw) as LlmPick;
  } catch {
    console.warn("[tipLlmFallback] non-JSON reply, raw:", raw.slice(0, 200));
    return null;
  }

  if (!parsed.market || !parsed.selection) return null;
  const market = parsed.market.toUpperCase();
  if (!ALLOWED_MARKETS.has(market)) {
    console.warn("[tipLlmFallback] unknown market from LLM:", parsed.market);
    return null;
  }
  const selection = normalizeSelection(market, parsed.selection, fixture);
  if (!selection) {
    console.warn("[tipLlmFallback] could not normalize selection", { market, raw: parsed.selection, home: fixture.homeTeam, away: fixture.awayTeam });
    return null;
  }
  return { market, selection, odds: parseLlmOdds(parsed.odds) };
}

const FULL_SYSTEM_PROMPT = `Tu es un analyseur de pronostics sportifs. On te donne le texte OCR (souvent bruité) et parfois la capture d'écran d'un message posté dans un groupe de tipsters. Ton job: identifier LE MATCH (équipe domicile vs équipe extérieur) ET la sélection.

RÈGLES:
- IGNORE ABSOLUMENT les éléments d'interface du bookmaker: mots "Kick Off", "Kick-off", "Bet Slip", "Coupon", "Home", "Away", "1st half", "Full Time", "Match", "Popular", "Total", "Bet Builder", "Goals", "Match Goals", "Half", "Asian Lines", "Main markets", "Bet Selection", "Odds", "Ok", "Add to bet slip", "Live", "Prematch", "Regular time", "Timeout", "Basketball", "Football", "Tennis", "1st Goal", "Full time result", "Popular", "1X2", "HCAP", "TOTAL", et tout mot descriptif d'écran de paris. Ces mots ne sont JAMAIS un nom d'équipe.
- Les VRAIS noms d'équipes sont: soit des noms propres reconnaissables ("Yangon City", "Yadanarbon", "Atlantis 2", "PPS", "Dzongri FC", "Red Panda FC", "Muniz II", "Barracas II"), soit dans le header en haut d'un slip ("Team A vs Team B", "Team A - Team B"), soit à côté d'un score / logo dans une carte match. JAMAIS l'entête d'une colonne ou d'un onglet UI.
- Si tu ne peux pas identifier avec certitude les DEUX équipes comme de VRAIS noms propres de clubs (pas des mots UI, pas des fragments OCR ≤2 lettres sauf abréviations tout-caps type "OM" "AC"), réponds tout à null. Mieux vaut null que "Kick Off vs Ww".
- Une "sélection mise en avant" = surlignée, encadrée, cochée, dans un panier "coupon/Bet slip/ticket"; OU énoncée en toutes lettres, y compris en argot ("victoire de X", "je prends/pars sur X", "je mets/blinde/charge", "banker", "coup sûr", "ça passe", "j'ai pris", "over/plus de 2.5", "under/moins de 3", "handicap -4.5", "W1", "les deux marquent"); OU une seule cote visible pour un marché.
- Une sélection énoncée dans une phrase d'analyse compte, même sans coupon ni cote (ex: "3-0 à la pause, over 4.5 facile" => OVER_UNDER OVER_4_5).
- Si les deux cotes d'un marché sont visibles sans aucun indice de pick, réponds sélection null (mais remplis quand même homeTeam/awayTeam si tu les identifies).
- Direction: "Over 6.5" écrit clairement dans la légende = OVER_6_5, JAMAIS UNDER, même si la colonne "Over" est à côté de la colonne "Under" dans le slip. Le sens vient du texte, pas d'un onglet UI.

FORMATS DE RETOUR — JSON strict, RIEN d'autre:
{
  "homeTeam": "Nom exact équipe domicile" | null,
  "awayTeam": "Nom exact équipe extérieur" | null,
  "market": "1X2" | "OVER_UNDER" | "OVER_UNDER_HT" | "BTTS" | "DOUBLE_CHANCE" | "HANDICAP" | null,
  "selection": string | null,
  "odds": number | null
}

Selection format:
  - 1X2 → slug de l'équipe gagnante (ex "bocajuniors") ou "DRAW"
  - OVER_UNDER → "OVER_2_5", "UNDER_1_5", etc.
  - OVER_UNDER_HT → comme OVER_UNDER mais SEULEMENT si le pari vise la 1ère mi-temps ("1ère mi-temps", "MT", "HT", "1st half")
  - BTTS → "YES" ou "NO"
  - DOUBLE_CHANCE → "1X", "X2", "12"
  - HANDICAP → valeur avec signe ("-1.5", "+2")

Extraire un pari réellement énoncé n'est pas deviner. N'invente un pari QUE quand aucun n'est exprimé. Réponds UNIQUEMENT le JSON.`;

interface LlmFullTip {
  homeTeam: string | null;
  awayTeam: string | null;
  market: string | null;
  selection: string | null;
  odds?: number | string | null;
}

/**
 * Second-tier LLM fallback: called when the deterministic parser couldn't
 * even extract a fixture. Asks the model to identify home/away teams too.
 * Only fires when there's some betting signal in the text (odds value
 * present), to keep chat noise from turning into API calls.
 */
export async function extractFullTipWithLLM(args: {
  rawText: string;
  imageBuffer?: Buffer;
}): Promise<{ homeTeam: string; awayTeam: string; market: string | null; selection: string | null; odds: number | null } | null> {
  const client = await getClient();
  if (!client) return null;

  const { rawText, imageBuffer } = args;
  const { model } = getTipLlmFallbackConfig();

  const userText = `Texte OCR / message brut:
"""
${rawText.slice(0, 4000)}
"""

Identifie le match (équipes) et si possible la sélection. JSON strict.`;

  const content: Anthropic.MessageParam["content"] = [];
  if (imageBuffer && imageBuffer.length > 0 && imageBuffer.length < 5 * 1024 * 1024) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: imageBuffer.toString("base64") },
    });
  }
  content.push({ type: "text", text: userText });

  let response: Anthropic.Message;
  try {
    response = await Promise.race([
      client.messages.create({
        model,
        max_tokens: 256,
        system: FULL_SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("LLM timeout")), LLM_TIMEOUT_MS)),
    ]);
  } catch (err) {
    console.warn("[tipLlmFallback:full] call failed:", err instanceof Error ? err.message : err);
    return null;
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) return null;

  const raw = textBlock.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: LlmFullTip;
  try {
    parsed = JSON.parse(raw) as LlmFullTip;
  } catch {
    console.warn("[tipLlmFallback:full] non-JSON reply, raw:", raw.slice(0, 200));
    return null;
  }

  if (!parsed.homeTeam || !parsed.awayTeam) return null;
  if (parsed.homeTeam.length > 60 || parsed.awayTeam.length > 60) return null;

  let market: string | null = null;
  let selection: string | null = null;
  if (parsed.market && parsed.selection) {
    const m = parsed.market.toUpperCase();
    if (ALLOWED_MARKETS.has(m)) {
      const fixture: Fixture = { homeTeam: parsed.homeTeam, awayTeam: parsed.awayTeam };
      const normalized = normalizeSelection(m, parsed.selection, fixture);
      if (normalized) {
        market = m;
        selection = normalized;
      }
    }
  }

  return { homeTeam: parsed.homeTeam, awayTeam: parsed.awayTeam, market, selection, odds: parseLlmOdds(parsed.odds) };
}
