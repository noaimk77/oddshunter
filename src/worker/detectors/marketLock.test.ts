import { describe, expect, it } from "vitest";
import { detectMarketLock } from "./marketLock";

describe("detectMarketLock", () => {
  it("does nothing when the market is open and no lock signal exists", () => {
    expect(detectMarketLock("open", false)).toEqual({ action: "none" });
  });

  it("opens a signal when the market becomes suspended and none exists yet", () => {
    expect(detectMarketLock("suspended", false)).toEqual({ action: "open_signal" });
  });

  it("opens a signal when the market becomes closed and none exists yet", () => {
    expect(detectMarketLock("closed", false)).toEqual({ action: "open_signal" });
  });

  it("does nothing when the market is still suspended and a signal is already open", () => {
    expect(detectMarketLock("suspended", true)).toEqual({ action: "none" });
  });

  it("resolves the signal when the market reopens", () => {
    expect(detectMarketLock("open", true)).toEqual({ action: "resolve_signal" });
  });
});
