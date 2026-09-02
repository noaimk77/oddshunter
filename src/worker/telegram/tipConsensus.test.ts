import { describe, expect, it } from "vitest";
import {
  applyConsensusAndAlert,
  checkConsensus,
  claimConsensusAlert,
  releaseConsensusAlert,
} from "./tipConsensus";
import { buildParsedTip } from "./tipParser";

// ---------------------------------------------------------------------------
// Minimal in-memory stand-in for the slice of PrismaClient the consensus
// code touches. Enforces the ConsensusAlert.fingerprint unique constraint
// (P2002) and a fixed sentAt so "most recent row" logic can't accidentally
// look correct — a regression to that logic must fail the directional test.
// ---------------------------------------------------------------------------
interface ScrapedTipRow {
  id: string;
  sourceChatId: string;
  fingerprint: string;
  homeTeam: string | null;
  awayTeam: string | null;
  market: string | null;
  selection: string | null;
  detectedAt: Date;
}
interface ConsensusAlertRow {
  id: string;
  fingerprint: string;
  groupCount: number;
  sentAt: Date;
  homeTeam: string | null;
  awayTeam: string | null;
  market: string | null;
  selection: string | null;
  oddsAtAlert: number | null;
  sentChatId: string | null;
  sentMessageId: bigint | null;
}

const FIXED_SENT_AT = new Date("2020-01-01T00:00:00Z");

function makeFakeDb(tips: Array<Partial<ScrapedTipRow>> = []) {
  const scrapedTips: ScrapedTipRow[] = tips.map((t, i) => ({
    id: t.id ?? `tip_${i}`,
    sourceChatId: t.sourceChatId ?? `chat_${i}`,
    fingerprint: t.fingerprint ?? "",
    homeTeam: t.homeTeam ?? null,
    awayTeam: t.awayTeam ?? null,
    market: t.market ?? null,
    selection: t.selection ?? null,
    detectedAt: t.detectedAt ?? new Date(),
  }));
  const alerts: ConsensusAlertRow[] = [];
  let seq = 0;

  const db = {
    _alerts: alerts,
    scrapedTip: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async ({ where = {}, orderBy }: any) => {
        let rows = scrapedTips.filter((t) => {
          if (where.fingerprint !== undefined && t.fingerprint !== where.fingerprint) return false;
          if (where.detectedAt?.gte && t.detectedAt < where.detectedAt.gte) return false;
          if (where.OR) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ok = where.OR.some(
              (c: any) =>
                (c.homeTeam === undefined || c.homeTeam === t.homeTeam) &&
                (c.awayTeam === undefined || c.awayTeam === t.awayTeam),
            );
            if (!ok) return false;
          }
          return true;
        });
        if (orderBy?.detectedAt === "desc") {
          rows = [...rows].sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
        }
        return rows.map((r) => ({ ...r }));
      },
    },
    consensusAlert: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async ({ data }: any) => {
        if (alerts.some((a) => a.fingerprint === data.fingerprint)) {
          const err = new Error("Unique constraint failed on the fields: (`fingerprint`)") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const row: ConsensusAlertRow = {
          id: `ca_${++seq}`,
          fingerprint: data.fingerprint,
          groupCount: data.groupCount,
          sentAt: FIXED_SENT_AT,
          homeTeam: null,
          awayTeam: null,
          market: null,
          selection: null,
          oddsAtAlert: null,
          sentChatId: null,
          sentMessageId: null,
        };
        alerts.push(row);
        return { ...row };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deleteMany: async ({ where = {} }: any) => {
        let count = 0;
        for (let i = alerts.length - 1; i >= 0; i--) {
          const a = alerts[i];
          if (where.fingerprint !== undefined && a.fingerprint !== where.fingerprint) continue;
          if (where.sentMessageId === null && a.sentMessageId !== null) continue;
          if (where.sentChatId === null && a.sentChatId !== null) continue;
          alerts.splice(i, 1);
          count++;
        }
        return { count };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: async ({ where, data }: any) => {
        const a = alerts.find((r) => (where.id !== undefined ? r.id === where.id : r.fingerprint === where.fingerprint));
        if (!a) {
          const err = new Error("Record to update not found.") as Error & { code: string };
          err.code = "P2025";
          throw err;
        }
        Object.assign(a, data);
        return { ...a };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findFirst: async () => (alerts.length ? { ...alerts[0] } : null),
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return db as any;
}

const CONFIG = { minGroups: 3, windowMinutes: 1440 };

function strictTip(chat: string, selection = "OVER_2_5") {
  return {
    sourceChatId: chat,
    fingerprint: `lyon|marseille|OVER_UNDER|${selection}`,
    homeTeam: "Lyon",
    awayTeam: "Marseille",
    market: "OVER_UNDER",
    selection,
    detectedAt: new Date(),
  };
}

const PARSED = buildParsedTip({ homeTeam: "Lyon", awayTeam: "Marseille" }, { market: "OVER_UNDER", selection: "OVER_2_5" });

describe("applyConsensusAndAlert — observation mode never consumes a consensus", () => {
  it("with SEND disabled: reports the consensus but claims nothing, so enabling SEND later still fires", async () => {
    const db = makeFakeDb([strictTip("c1"), strictTip("c2"), strictTip("c3")]);

    const observed = await applyConsensusAndAlert(db, PARSED, {
      config: CONFIG,
      sendEnabled: false,
      send: async () => {
        throw new Error("send must not be called in observation mode");
      },
    });
    expect(observed).toMatchObject({ mode: "strict", triggered: true, sent: false, claimed: false, reason: "observation" });
    expect(db._alerts).toHaveLength(0); // nothing consumed

    let sentTip: unknown = null;
    const real = await applyConsensusAndAlert(db, PARSED, {
      config: CONFIG,
      sendEnabled: true,
      send: async (tip) => {
        sentTip = tip;
        return { chatId: "vip", messageId: 555 };
      },
    });
    expect(real).toMatchObject({ mode: "strict", sent: true, claimed: true });
    expect(sentTip).toMatchObject({ homeTeam: "Lyon", awayTeam: "Marseille", groupCount: 3 });
    expect(db._alerts).toHaveLength(1);
    expect(db._alerts[0]).toMatchObject({
      fingerprint: PARSED.fingerprint,
      sentChatId: "vip",
      sentMessageId: BigInt(555),
      homeTeam: "Lyon",
    });
  });
});

describe("applyConsensusAndAlert — a failed Telegram send leaves the alert retryable", () => {
  it("releases the claim when send throws, then a later attempt delivers it", async () => {
    const db = makeFakeDb([strictTip("c1"), strictTip("c2"), strictTip("c3")]);

    const failed = await applyConsensusAndAlert(db, PARSED, {
      config: CONFIG,
      sendEnabled: true,
      send: async () => {
        throw new Error("Telegram 429 Too Many Requests");
      },
    });
    expect(failed).toMatchObject({ mode: "strict", sent: false, claimed: false, reason: "send-failed" });
    expect(db._alerts).toHaveLength(0); // claim rolled back — nothing left to block a retry

    const retried = await applyConsensusAndAlert(db, PARSED, {
      config: CONFIG,
      sendEnabled: true,
      send: async () => ({ chatId: "vip", messageId: 777 }),
    });
    expect(retried).toMatchObject({ sent: true, claimed: true });
    expect(db._alerts).toHaveLength(1);
    expect(db._alerts[0]).toMatchObject({ fingerprint: PARSED.fingerprint, sentMessageId: BigInt(777) });
  });

  it("releases the claim when send returns null (no usable message id)", async () => {
    const db = makeFakeDb([strictTip("c1"), strictTip("c2"), strictTip("c3")]);
    const res = await applyConsensusAndAlert(db, PARSED, {
      config: CONFIG,
      sendEnabled: true,
      send: async () => null,
    });
    expect(res).toMatchObject({ sent: false, claimed: false, reason: "send-returned-null" });
    expect(db._alerts).toHaveLength(0);
  });
});

describe("applyConsensusAndAlert — directional consensus updates exactly the row it created", () => {
  it("two directional consensuses in a row: each ConsensusAlert keeps its own fixture and message id", async () => {
    // Fixture A: Lyon vs Marseille, three chats, three different over lines
    // (no strict trio) -> directional "over_goals".
    // Fixture B: Porto vs Benfica, same shape.
    const db = makeFakeDb([
      { sourceChatId: "a1", fingerprint: "lyon|marseille|OVER_UNDER|OVER_2_5", homeTeam: "Lyon", awayTeam: "Marseille", market: "OVER_UNDER", selection: "OVER_2_5", detectedAt: new Date() },
      { sourceChatId: "a2", fingerprint: "lyon|marseille|OVER_UNDER|OVER_3_5", homeTeam: "Lyon", awayTeam: "Marseille", market: "OVER_UNDER", selection: "OVER_3_5", detectedAt: new Date() },
      { sourceChatId: "a3", fingerprint: "lyon|marseille|OVER_UNDER|OVER_4_5", homeTeam: "Lyon", awayTeam: "Marseille", market: "OVER_UNDER", selection: "OVER_4_5", detectedAt: new Date() },
      { sourceChatId: "b1", fingerprint: "benfica|porto|OVER_UNDER|OVER_1_5", homeTeam: "Porto", awayTeam: "Benfica", market: "OVER_UNDER", selection: "OVER_1_5", detectedAt: new Date() },
      { sourceChatId: "b2", fingerprint: "benfica|porto|OVER_UNDER|OVER_2_5", homeTeam: "Porto", awayTeam: "Benfica", market: "OVER_UNDER", selection: "OVER_2_5", detectedAt: new Date() },
      { sourceChatId: "b3", fingerprint: "benfica|porto|OVER_UNDER|OVER_3_5", homeTeam: "Porto", awayTeam: "Benfica", market: "OVER_UNDER", selection: "OVER_3_5", detectedAt: new Date() },
    ]);

    const parsedA = buildParsedTip({ homeTeam: "Lyon", awayTeam: "Marseille" }, { market: "OVER_UNDER", selection: "OVER_2_5" });
    const parsedB = buildParsedTip({ homeTeam: "Porto", awayTeam: "Benfica" }, { market: "OVER_UNDER", selection: "OVER_1_5" });

    const resA = await applyConsensusAndAlert(db, parsedA, {
      config: CONFIG,
      sendEnabled: true,
      send: async () => ({ chatId: "vip", messageId: 101 }),
    });
    const resB = await applyConsensusAndAlert(db, parsedB, {
      config: CONFIG,
      sendEnabled: true,
      send: async () => ({ chatId: "vip", messageId: 102 }),
    });

    expect(resA).toMatchObject({ mode: "directional", sent: true });
    expect(resB).toMatchObject({ mode: "directional", sent: true });
    expect(resA.fingerprint).toBe("dir:lyon|marseille|over_goals");
    expect(resB.fingerprint).toBe("dir:benfica|porto|over_goals");

    const rowA = db._alerts.find((a: ConsensusAlertRow) => a.fingerprint === resA.fingerprint);
    const rowB = db._alerts.find((a: ConsensusAlertRow) => a.fingerprint === resB.fingerprint);

    // Each row carries ITS OWN fixture + message id. A regression to
    // "update the most recent dir: row" would put B's data on rowA (or
    // leave rowB blank), since sentAt is identical for both.
    expect(rowA).toMatchObject({ homeTeam: "Lyon", awayTeam: "Marseille", sentMessageId: BigInt(101), sentChatId: "vip" });
    expect(rowB).toMatchObject({ homeTeam: "Porto", awayTeam: "Benfica", sentMessageId: BigInt(102), sentChatId: "vip" });
    expect(db._alerts).toHaveLength(2);
  });
});

describe("consensus primitives", () => {
  it("checkConsensus with { claim: false } measures without creating a row", async () => {
    const db = makeFakeDb([strictTip("c1"), strictTip("c2"), strictTip("c3")]);
    const r = await checkConsensus(db, PARSED.fingerprint, CONFIG, { claim: false });
    expect(r).toMatchObject({ triggered: true, groupCount: 3, fingerprint: PARSED.fingerprint });
    expect(db._alerts).toHaveLength(0);
  });

  it("checkConsensus below threshold does not trigger", async () => {
    const db = makeFakeDb([strictTip("c1"), strictTip("c2")]);
    const r = await checkConsensus(db, PARSED.fingerprint, CONFIG, { claim: false });
    expect(r.triggered).toBe(false);
    expect(r.groupCount).toBe(2);
  });

  it("claimConsensusAlert is a concurrency latch: second claim of the same fingerprint loses", async () => {
    const db = makeFakeDb();
    expect(await claimConsensusAlert(db, "fp-x", 3)).toEqual({ claimed: true });
    expect(await claimConsensusAlert(db, "fp-x", 3)).toEqual({ claimed: false });
    expect(db._alerts).toHaveLength(1);
  });

  it("releaseConsensusAlert removes an unsent claim but never a delivered alert", async () => {
    const db = makeFakeDb();
    await claimConsensusAlert(db, "fp-unsent", 3);
    await claimConsensusAlert(db, "fp-sent", 3);
    await db.consensusAlert.update({ where: { fingerprint: "fp-sent" }, data: { sentChatId: "vip", sentMessageId: BigInt(9) } });

    await releaseConsensusAlert(db, "fp-unsent");
    await releaseConsensusAlert(db, "fp-sent");

    const left = db._alerts.map((a: ConsensusAlertRow) => a.fingerprint);
    expect(left).toEqual(["fp-sent"]);
  });

  it("applyConsensusAndAlert reports already-claimed without sending when the row exists", async () => {
    const db = makeFakeDb([strictTip("c1"), strictTip("c2"), strictTip("c3")]);
    await claimConsensusAlert(db, PARSED.fingerprint, 3); // someone else got there first
    let sendCalls = 0;
    const res = await applyConsensusAndAlert(db, PARSED, {
      config: CONFIG,
      sendEnabled: true,
      send: async () => {
        sendCalls++;
        return { chatId: "vip", messageId: 1 };
      },
    });
    expect(res).toMatchObject({ sent: false, claimed: false, reason: "already-claimed" });
    expect(sendCalls).toBe(0);
  });
});
