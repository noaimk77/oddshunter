import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { composeValidatedPost, publishValidatedPick, resetDailyCapForTests, type ValidatedPick } from "./bufferPublisher";

const pickFixture: ValidatedPick = {
  id: "alert_1",
  homeTeam: "Aleksandrovac",
  awayTeam: "Drina Zvornik",
  market: "OVER_UNDER",
  selection: "OVER_1_5",
  homeScore: 2,
  awayScore: 0,
  halfTimeScore: null,
};

function mockBuffer(responses: unknown[]) {
  const bodies: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)).query);
    const next = responses.shift() ?? { data: { createPost: { __typename: "PostActionSuccess", post: { id: "p1" } } } };
    return new Response(JSON.stringify(next), { status: 200 });
  });
  return bodies;
}

describe("bufferPublisher", () => {
  beforeEach(() => {
    vi.stubEnv("BUFFER_API_KEY", "test-key");
    resetDailyCapForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("writes the match, the pick in French, the score, the Telegram link and the risk notice", () => {
    const text = composeValidatedPost(pickFixture);
    expect(text).toContain("Aleksandrovac vs Drina Zvornik");
    expect(text).toContain("Plus de 1,5 buts");
    expect(text).toContain("Score : 2-0");
    expect(text).toContain("t.me/oddshunter98");
    expect(text).toContain("Jouer comporte des risques");
  });

  it("shows the half-time score for a first-half pick", () => {
    const text = composeValidatedPost({ ...pickFixture, market: "OVER_UNDER_HT", halfTimeScore: { homeScore: 1, awayScore: 1 } });
    expect(text).toContain("1-1 à la mi-temps");
  });

  it("varies the wording across alerts", () => {
    const texts = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => composeValidatedPost({ ...pickFixture, id })));
    expect(texts.size).toBeGreaterThan(1);
  });

  it("publishes immediately on the X channel", async () => {
    const queries = mockBuffer([]);
    expect(await publishValidatedPick(pickFixture)).toBe(true);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("mode: shareNow");
    expect(queries[0]).toContain('channelId: "6ad7845e778b240e2f6ad942"');
    expect(queries[0]).toContain("assets: []");
    expect(queries[0]).toContain("needsApproval: false");
  });

  it("falls back to the queue when Buffer's schema rejects shareNow", async () => {
    const queries = mockBuffer([{ errors: [{ message: 'Value "shareNow" does not exist in "ShareMode" enum.' }] }]);
    expect(await publishValidatedPick(pickFixture)).toBe(true);
    expect(queries[1]).toContain("mode: addToQueue");
  });

  it("reports a Buffer business error without throwing", async () => {
    mockBuffer([{ data: { createPost: { __typename: "LimitReachedError", message: "Queue full" } } }]);
    expect(await publishValidatedPick(pickFixture)).toBe(false);
  });

  it("never throws when Buffer is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    await expect(publishValidatedPick(pickFixture)).resolves.toBe(false);
  });

  it("stops after 6 posts in the same day", async () => {
    mockBuffer([]);
    const now = new Date("2026-10-22T12:00:00Z");
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await publishValidatedPick({ ...pickFixture, id: `a${i}` }, now));
    expect(results.filter(Boolean)).toHaveLength(6);
    expect(results[6]).toBe(false);
  });

  it("does nothing without a Buffer key", async () => {
    vi.stubEnv("BUFFER_API_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await publishValidatedPick(pickFixture)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
