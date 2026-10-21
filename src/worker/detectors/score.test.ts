import { describe, expect, it } from "vitest";
import { DEFAULT_SCORE_WEIGHTS, scoreSignal, type ScoreFactors } from "./score";

const allZero: ScoreFactors = {
  amplitude: 0,
  speed: 0,
  persistence: 0,
  multiBookAgreement: 0,
  volume: 0,
  liquidity: 0,
  proximityToKickoff: 0,
  competitionQuality: 0,
  marketStatus: 0,
  explainability: 1, // fully explained by a known event = contributes zero suspicion (inverted in scoreSignal)
  sourceQuality: 0,
};

const allMax: ScoreFactors = Object.fromEntries(
  Object.keys(allZero).map((k) => [k, k === "explainability" ? 0 : 1]),
) as unknown as ScoreFactors;

describe("scoreSignal", () => {
  it("scores 0 when every factor is at its minimum", () => {
    expect(scoreSignal(allZero).score).toBe(0);
  });

  it("scores 100 when every suspicious factor is maxed and the move is fully unexplained", () => {
    expect(scoreSignal(allMax).score).toBe(100);
  });

  it("a fully explainable move (explainability=1) scores lower than an identical unexplained one", () => {
    const unexplained = scoreSignal(allMax);
    const explained = scoreSignal({ ...allMax, explainability: 1 });
    expect(explained.score).toBeLessThan(unexplained.score);
  });

  it("returns one reason per weighted factor, sorted by contribution descending", () => {
    const { reasons } = scoreSignal(allMax);
    expect(reasons).toHaveLength(Object.keys(DEFAULT_SCORE_WEIGHTS).length);
    for (let i = 1; i < reasons.length; i++) {
      expect(reasons[i - 1].contribution).toBeGreaterThanOrEqual(reasons[i].contribution);
    }
  });

  it("custom weights change the score", () => {
    const heavyAmplitude = { ...DEFAULT_SCORE_WEIGHTS, amplitude: 1, speed: 0, persistence: 0, multiBookAgreement: 0, volume: 0, liquidity: 0, proximityToKickoff: 0, competitionQuality: 0, marketStatus: 0, explainability: 0, sourceQuality: 0 };
    const factors: ScoreFactors = { ...allZero, amplitude: 1 };
    expect(scoreSignal(factors, heavyAmplitude).score).toBe(100);
  });
});
