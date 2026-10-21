import { describe, expect, it } from "vitest";
import { countryFlagEmoji } from "./countryFlag";

describe("countryFlagEmoji", () => {
  it("returns the correct flag for a known country", () => {
    expect(countryFlagEmoji("India")).toBe("🇮🇳");
    expect(countryFlagEmoji("Bolivia")).toBe("🇧🇴");
  });

  it("handles hyphenated country names from API-Football", () => {
    expect(countryFlagEmoji("South-Korea")).toBe("🇰🇷");
    expect(countryFlagEmoji("Faroe-Islands")).toBe("🇫🇴");
  });

  it("returns an empty string for an unmapped or missing country", () => {
    expect(countryFlagEmoji("Atlantis")).toBe("");
    expect(countryFlagEmoji(null)).toBe("");
    expect(countryFlagEmoji(undefined)).toBe("");
  });
});
