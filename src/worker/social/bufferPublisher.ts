import { formatMarketSelection, sanitizeTeamName } from "../telegram/alertFormat";

/**
 * Posts validated VIP picks on X through Buffer (free plan) — Buffer holds
 * the X API access, so we don't pay X's per-post API pricing. Only WON picks
 * are published, after the match: the pick itself is what VIP subscribers
 * pay for, so nothing goes out before kick-off.
 *
 * Best-effort by design: a Buffer failure is logged and swallowed, it must
 * never delay or break the Telegram side.
 */

const BUFFER_API_URL = "https://api.buffer.com";
/** @odds_hunter98 X channel in Buffer — overridable without a deploy. */
const DEFAULT_X_CHANNEL_ID = "6ad7845e778b240e2f6ad942";
const MAX_POSTS_PER_DAY = 6;
const TELEGRAM_LINK = "t.me/oddshunter98";

export function isBufferConfigured(): boolean {
  return Boolean(process.env.BUFFER_API_KEY);
}

const INTROS = [
  "✅ Prono VIP validé",
  "✅ Encore un prono VIP qui passe",
  "✅ Validé pour le VIP",
  "✅ Prono VIP gagnant",
];
const OUTROS = [
  `Pronos gratuits chaque jour : ${TELEGRAM_LINK}`,
  `Rejoins le canal gratuit : ${TELEGRAM_LINK}`,
  `Les prochains pronos gratuits sont ici : ${TELEGRAM_LINK}`,
];

/** Stable per alert, so a retried publish keeps the same wording. */
function pick<T>(items: T[], seed: string): T {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return items[Math.abs(hash) % items.length];
}

export interface ValidatedPick {
  id: string;
  homeTeam: string;
  awayTeam: string;
  market: string;
  selection: string;
  homeScore: number;
  awayScore: number;
  halfTimeScore: { homeScore: number; awayScore: number } | null;
}

export function composeValidatedPost(p: ValidatedPick): string {
  const score = p.halfTimeScore
    ? `${p.halfTimeScore.homeScore}-${p.halfTimeScore.awayScore} à la mi-temps`
    : `${p.homeScore}-${p.awayScore}`;
  return [
    pick(INTROS, p.id),
    "",
    `⚽ ${sanitizeTeamName(p.homeTeam)} vs ${sanitizeTeamName(p.awayTeam)}`,
    `🎯 ${formatMarketSelection(p)}`,
    `📊 Score : ${score}`,
    "",
    pick(OUTROS, p.id),
    "",
    "🔞 Jouer comporte des risques.",
  ].join("\n");
}

// In-memory daily cap: a restart resets it, which at worst allows a few
// extra posts that day — acceptable for a safety rail, not worth a table.
let capDay = "";
let postsToday = 0;

function takeDailySlot(now: Date): boolean {
  const day = now.toISOString().slice(0, 10);
  if (day !== capDay) {
    capDay = day;
    postsToday = 0;
  }
  if (postsToday >= MAX_POSTS_PER_DAY) return false;
  postsToday++;
  return true;
}

/** Test hook — resets the daily cap. */
export function resetDailyCapForTests(): void {
  capDay = "";
  postsToday = 0;
}

type CreatePostResult =
  | { ok: true; postId: string | null }
  | { ok: false; error: string; schemaRejected: boolean };

/**
 * One createPost mutation. Arguments are inlined (JSON string syntax is
 * valid GraphQL string syntax) so we don't depend on Buffer's input type
 * names, which their docs don't spell out.
 */
async function createPost(text: string, channelId: string, mode: "shareNow" | "addToQueue"): Promise<CreatePostResult> {
  const query = `mutation {
  createPost(input: { text: ${JSON.stringify(text)}, channelId: ${JSON.stringify(channelId)}, schedulingType: automatic, mode: ${mode} }) {
    __typename
    ... on PostActionSuccess { post { id } }
    ... on MutationError { message }
  }
}`;
  const res = await fetch(BUFFER_API_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.BUFFER_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = (await res.json().catch(() => null)) as {
    data?: { createPost?: { __typename?: string; post?: { id?: string }; message?: string } };
    errors?: { message?: string }[];
  } | null;

  if (body?.errors?.length) {
    // GraphQL validation errors (e.g. an enum value Buffer doesn't accept).
    return { ok: false, error: body.errors.map((e) => e.message).join("; "), schemaRejected: true };
  }
  const result = body?.data?.createPost;
  if (!res.ok || !result) return { ok: false, error: `HTTP ${res.status}`, schemaRejected: false };
  if (result.__typename !== "PostActionSuccess") {
    return { ok: false, error: result.message ?? result.__typename ?? "unknown error", schemaRejected: false };
  }
  return { ok: true, postId: result.post?.id ?? null };
}

/** Publishes a WON pick on X. Never throws. */
export async function publishValidatedPick(p: ValidatedPick, now = new Date()): Promise<boolean> {
  if (!isBufferConfigured()) return false;
  if (!takeDailySlot(now)) {
    console.log(`[buffer] daily cap of ${MAX_POSTS_PER_DAY} posts reached — skipping ${p.id}`);
    return false;
  }
  const channelId = process.env.BUFFER_X_CHANNEL_ID || DEFAULT_X_CHANNEL_ID;
  const text = composeValidatedPost(p);
  try {
    let result = await createPost(text, channelId, "shareNow");
    // If Buffer's schema doesn't take "shareNow", the next queue slot is
    // still a post within hours — better than nothing.
    if (!result.ok && result.schemaRejected) result = await createPost(text, channelId, "addToQueue");
    if (!result.ok) {
      console.error(`[buffer] publish failed for ${p.id}: ${result.error}`);
      return false;
    }
    console.log(`[buffer] published validated pick ${p.id} (post ${result.postId ?? "?"})`);
    return true;
  } catch (err) {
    console.error(`[buffer] publish failed for ${p.id}:`, err instanceof Error ? err.message : err);
    return false;
  }
}
