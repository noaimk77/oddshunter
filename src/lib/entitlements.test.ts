import { describe, expect, it } from "vitest";
import { mapStripeStatus } from "./entitlements";

describe("mapStripeStatus", () => {
  it("treats active and trialing subscriptions as ACTIVE", () => {
    expect(mapStripeStatus("active")).toBe("ACTIVE");
    expect(mapStripeStatus("trialing")).toBe("ACTIVE");
  });

  it("treats past_due and unpaid as PAST_DUE, not silently ACTIVE", () => {
    expect(mapStripeStatus("past_due")).toBe("PAST_DUE");
    expect(mapStripeStatus("unpaid")).toBe("PAST_DUE");
  });

  it("treats canceled and incomplete_expired as CANCELED", () => {
    expect(mapStripeStatus("canceled")).toBe("CANCELED");
    expect(mapStripeStatus("incomplete_expired")).toBe("CANCELED");
  });

  it("falls back to INCOMPLETE for incomplete, paused, or any unrecognized status", () => {
    expect(mapStripeStatus("incomplete")).toBe("INCOMPLETE");
    expect(mapStripeStatus("paused")).toBe("INCOMPLETE");
  });
});
