"""Overlay v189: only FixHunter posts to the VIP on its own.

Applies on top of the production v188 files (config.ts, vipFolder.ts and its
test, tipListener.ts). Usage: python3 patch_v189.py <root>

Noaim 2026-10-28: "le seul groupe où on envoie dans le VIP sans forcément
qu'un deuxième ait envoyé le même est FixHunter, le reste il faut que 2
groupes envoient le même prono". Before: every group of his Telegram folder
"VIP" (Suspicious Game…) and Vip ESPORTS' "Max bet"/"3/3" were posted alone,
and a Vip ESPORTS flip could post on its own. Now a lone pick goes to the VIP
only from FixHunter (by chat id, LONE_VIP_SOURCE_CHAT_IDS); the others wait for
a second group. A flip is only posted as a reply under an alert already in the
VIP. Autobet routing of lone picks is untouched.
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


patch("src/worker/config.ts", [
    ("""export function getTrustedSingleSourceChatIds(): Set<string> {""",
     """/** The only group whose lone pick is posted to the VIP without a second group
 *  (Noaim 2026-10-28): FixHunter, by chat id so a renamed look-alike can't pass. */
export function getLoneVipSourceChatIds(): Set<string> {
  const raw = process.env.LONE_VIP_SOURCE_CHAT_IDS ?? "-1001999889425";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

export function getTrustedSingleSourceChatIds(): Set<string> {"""),
], "getLoneVipSourceChatIds")

patch("src/worker/telegram/vipFolder.ts", [
    ("""/**
 * Whether a pick that no second group has confirmed is posted to the VIP group.
 * The esports channel keeps its own rule — only its sure calls, "Max bet" and
 * 3/3 (Noaim 2026-10-08; its flips are posted by their own path). Any other
 * VIP-folder group is posted on its own word.
 */
export function lonePickGoesToVip(a: { trusted: boolean; tier: ConfidenceTier | null; inVipFolder: boolean; rawText: string }): boolean {
  if (a.trusted) return a.tier === "max" || a.tier === "3/3";
  return a.inVipFolder && !AUTO_TEST_FEED_RE.test(a.rawText);
}""", """/**
 * Whether a pick that no second group has confirmed is posted to the VIP group:
 * only FixHunter's (Noaim 2026-10-28). Every other group, those of the VIP
 * folder and the esports channel's "Max bet"/3/3 included, needs a second
 * group on the same pick; until then its pick is only recorded.
 */
export function lonePickGoesToVip(a: { loneVipSource: boolean; rawText: string }): boolean {
  return a.loneVipSource && !AUTO_TEST_FEED_RE.test(a.rawText);
}"""),
], "loneVipSource")

patch("src/worker/telegram/vipFolder.test.ts", [
    ("""describe("lonePickGoesToVip — a pick no second group confirmed", () => {
  const folder = { trusted: false, tier: null, inVipFolder: true, rawText: "1X 🇮🇳" };

  it("posts the pick of a VIP-folder group", () => {
    expect(lonePickGoesToVip(folder)).toBe(true);
  });

  it("keeps a group outside the folder silent", () => {
    expect(lonePickGoesToVip({ ...folder, inVipFolder: false })).toBe(false);
  });

  it("keeps Fix is fix's automated 'Value Bet TEST' feed silent", () => {
    const rawText = "🇫🇷 🎯 Pronostic : Over 0.5 HT Goals\\n📊 Stratégie : Value Bet TEST\\n\\n🏟 Match : Bradford P A vs Lincoln Utd";
    expect(lonePickGoesToVip({ ...folder, rawText })).toBe(false);
  });

  it("posts only the esports channel's sure picks: Max bet and 3/3", () => {
    const esports = { trusted: true, inVipFolder: true, rawText: "" };
    expect(lonePickGoesToVip({ ...esports, tier: "max" })).toBe(true);
    expect(lonePickGoesToVip({ ...esports, tier: "3/3" })).toBe(true);
    expect(lonePickGoesToVip({ ...esports, tier: "2/3" })).toBe(false);
    expect(lonePickGoesToVip({ ...esports, tier: "1/3" })).toBe(false);
    expect(lonePickGoesToVip({ ...esports, tier: null })).toBe(false);
  });""", """describe("lonePickGoesToVip — a pick no second group confirmed", () => {
  it("posts FixHunter's pick on its own", () => {
    expect(lonePickGoesToVip({ loneVipSource: true, rawText: "1X 🇮🇳" })).toBe(true);
  });

  it("keeps every other group silent until a second group agrees (VIP folder, Vip ESPORTS Max bet included)", () => {
    expect(lonePickGoesToVip({ loneVipSource: false, rawText: "1X 🇮🇳" })).toBe(false);
    expect(lonePickGoesToVip({ loneVipSource: false, rawText: "Max bet" })).toBe(false);
  });

  it("keeps Fix is fix's automated 'Value Bet TEST' feed silent", () => {
    const rawText = "🇫🇷 🎯 Pronostic : Over 0.5 HT Goals\\n📊 Stratégie : Value Bet TEST\\n\\n🏟 Match : Bradford P A vs Lincoln Utd";
    expect(lonePickGoesToVip({ loneVipSource: true, rawText })).toBe(false);
  });"""),
], "loneVipSource")

patch("src/worker/telegram/tipListener.ts", [
    ("""import { getTipConsensusConfig, """, """import { getLoneVipSourceChatIds, getTipConsensusConfig, """),
    ("""      // The VIP group gets real consensus (2+ sources), the pick of any group of
      // Noaim's Telegram folder "VIP", and the esports channel's sure calls only
      // (lonePickGoesToVip, Noaim 2026-10-08). Any other lone pick is still
      // recorded and bet by autobet, just never posted — and it is upgraded to a
      // VIP post if a second source agrees.""", """      // The VIP group gets real consensus (2+ sources) and FixHunter's lone
      // picks, nothing else (lonePickGoesToVip, Noaim 2026-10-28). Any other lone
      // pick is still recorded and bet by autobet, just never posted — and it is
      // upgraded to a VIP post if a second source agrees."""),
    ("""        if (!lonePickGoesToVip({ trusted, tier, inVipFolder: isVipFolderChat(sourceChatId), rawText: rawTextForStore })) {""",
     """        if (!lonePickGoesToVip({ loneVipSource: getLoneVipSourceChatIds().has(sourceChatId), rawText: rawTextForStore })) {"""),
    ("""      const posted = await sendVipText(client, formatFlipVip(fixture.homeTeam, fixture.awayTeam, target), orig?.sentMessageId ? Number(orig.sentMessageId) : undefined);
      // The flip message already says "cash out": don't let cashoutResolver add a second reply.
      if (posted && orig) await db.consensusAlert.update({ where: { id: orig.id }, data: { cashoutRepliedAt: new Date() } });""",
     """      // Only as a reply under a pick already in the VIP: on its own it would be a
      // one-group VIP post (Noaim 2026-10-28: 2 groups, FixHunter apart).
      if (orig?.sentMessageId) {
        const posted = await sendVipText(client, formatFlipVip(fixture.homeTeam, fixture.awayTeam, target), Number(orig.sentMessageId));
        // The flip message already says "cash out": don't let cashoutResolver add a second reply.
        if (posted) await db.consensusAlert.update({ where: { id: orig.id }, data: { cashoutRepliedAt: new Date() } });
      }"""),
], "getLoneVipSourceChatIds")
