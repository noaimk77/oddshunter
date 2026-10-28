/**
 * VIP alert photo (Noaim 2026-10-28: "tu screen la conversation et tu envoies
 * ça au lieu d'envoyer l'image"). Some source groups post a phone screenshot
 * of ANOTHER Telegram channel, header and bubbles included. The VIP gets only
 * the bookmaker screenshot inside it, cropped from the box the vision model
 * gives back. A plain slip, or no answer from the model, goes out unchanged.
 */
import sharp from "sharp";
import { locateBetImage, type BetImageBox } from "./tipLlmFallback";

/** The VIP post waits for this at most; past it the photo goes out as received. */
const LOCATE_TIMEOUT_MS = 10_000;
/** A crop smaller than this on either side is a misread box, not a slip. */
const MIN_SIDE_PX = 120;

export type LocateBetImage = (image: Buffer, pick: string) => Promise<{ chat: boolean; box: BetImageBox | null } | null>;

/**
 * The photo to post with the alert: the image itself when it is already a
 * slip (or the model can't tell), the cropped slip when it is a chat
 * screenshot, undefined (text-only alert) when it is a chat screenshot with
 * no usable slip in it.
 */
export async function cleanAlertImage(image: Buffer, pick: string, locate: LocateBetImage = locateBetImage): Promise<Buffer | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const found = await Promise.race([
    locate(image, pick).catch(() => null),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), LOCATE_TIMEOUT_MS);
    }),
  ]);
  clearTimeout(timer);
  if (!found || !found.chat) return image;
  if (!found.box) {
    console.log("[alertImage] chat screenshot with no slip found in it: alert posted without a photo.");
    return undefined;
  }
  try {
    const { width: w = 0, height: h = 0 } = await sharp(image).metadata();
    const [y0, x0, y1, x1] = found.box.map((v) => Math.min(1000, Math.max(0, v)) / 1000);
    const left = Math.round(x0 * w);
    const top = Math.round(y0 * h);
    const width = Math.min(Math.round((x1 - x0) * w), w - left);
    const height = Math.min(Math.round((y1 - y0) * h), h - top);
    if (width < MIN_SIDE_PX || height < MIN_SIDE_PX) {
      console.log(`[alertImage] slip box too small (${width}x${height}): alert posted without a photo.`);
      return undefined;
    }
    console.log(`[alertImage] chat screenshot cropped to the slip (${width}x${height} of ${w}x${h}).`);
    return await sharp(image).extract({ left, top, width, height }).jpeg({ quality: 90 }).toBuffer();
  } catch (err) {
    console.error("[alertImage] crop failed, alert posted without a photo:", err instanceof Error ? err.message : err);
    return undefined;
  }
}
