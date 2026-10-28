import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { cleanAlertImage } from "./alertImage";

// 440x880 like a phone screenshot of a channel.
const phone = () => sharp({ create: { width: 440, height: 880, channels: 3, background: "#7aa86a" } }).jpeg().toBuffer();

describe("cleanAlertImage", () => {
  it("capture de conversation : recadrée sur la capture de paris", async () => {
    const img = await phone();
    const out = await cleanAlertImage(img, "U21 — Plus de 4,5 buts", async () => ({ chat: true, box: [500, 30, 950, 970] }));
    const meta = await sharp(out!).metadata();
    expect(meta.width).toBe(414);
    expect(meta.height).toBe(396);
  });

  it("capture de paris directe, ou modèle muet : image inchangée", async () => {
    const img = await phone();
    expect(await cleanAlertImage(img, "x", async () => ({ chat: false, box: null }))).toBe(img);
    expect(await cleanAlertImage(img, "x", async () => null)).toBe(img);
    expect(await cleanAlertImage(img, "x", async () => { throw new Error("quota"); })).toBe(img);
  });

  it("conversation sans capture exploitable : pas de photo", async () => {
    const img = await phone();
    expect(await cleanAlertImage(img, "x", async () => ({ chat: true, box: null }))).toBeUndefined();
    expect(await cleanAlertImage(img, "x", async () => ({ chat: true, box: [100, 100, 110, 110] }))).toBeUndefined();
  });
});
