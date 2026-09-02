import { createWorker, PSM, type Worker } from "tesseract.js";
import sharp from "sharp";
import type { TelegramClient } from "telegram";
import type { Api } from "telegram/tl";

/**
 * One shared Tesseract worker for the whole process — spinning up a fresh
 * worker per image is what actually costs time (model load), not the
 * recognition itself. Free/local (Tesseract.js), no per-image API cost —
 * Noaim's call, 2026-08-22 (reconfirmed 2026-08-27), matching the 0€
 * constraint already set for the odds-provider side of this worker.
 */
let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker(["eng", "fra"]).then(async (w) => {
      // Bet slips are a single vertical column of short lines, not prose.
      // PSM 6 ("assume a uniform block of text") reads that layout far more
      // reliably than the default auto mode, which tends to shred a slip's
      // rows into unordered fragments (the failure behind team names like
      // "aru akKzim vs Ww A" in the 2026-08-26 logs).
      await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      return w;
    });
  }
  return workerPromise;
}

const OCR_TIMEOUT_MS = 20_000;

/**
 * Serializes the whole download+preprocess+recognize pipeline to at most
 * one photo in flight at a time. Nothing here gated concurrency before:
 * gramjs's `maxConcurrentDownloads: 1` only throttled the download step,
 * but `preprocessForOcr` clones a resized/grayscaled buffer (up to 2400px)
 * multiple times per image, and every incoming photo message kicks off its
 * own independent `handleMessage` call with no queueing. A quiet stream of
 * one photo every few minutes never showed this; a burst — several images
 * arriving back-to-back after the tip listener reconnects post-crash and
 * Telegram delivers whatever piled up while it was down — means several of
 * these heavy pipelines running at once. Confirmed 2026-08-31: the 512MB
 * Fly box got OOM-killed (exit_code=137) repeatedly that day, including two
 * restarts only 17 minutes apart — consistent with a reconnect burst
 * re-triggering the same crash it had just recovered from. Capping this to
 * one-at-a-time trades a little latency during a burst for not crashing.
 */
let ocrQueue: Promise<unknown> = Promise.resolve();
function withOcrLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = ocrQueue.then(fn, fn);
  ocrQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Tesseract wants ~300 DPI, near-black text on near-white, and no UI
 * chrome-gradient behind the glyphs. Telegram bet-slip screenshots are the
 * opposite: ~72 DPI, small, and very often light text on a dark theme.
 * This pass normalizes all of that so the recognizer has a fighting chance:
 * upscale, flatten to grayscale, stretch contrast, and — only when the
 * image reads as a dark theme (mean luminance low) — invert so the text
 * ends up dark. Best-effort: if sharp throws on an odd payload we just hand
 * back the original bytes.
 */
async function preprocessForOcr(buffer: Buffer): Promise<Buffer> {
  try {
    const base = sharp(buffer, { failOn: "none" }).rotate(); // honor EXIF orientation

    const meta = await base.metadata();
    const targetWidth = Math.min(2400, Math.max(1600, (meta.width ?? 800) * 2));

    let pipeline = base
      .resize({ width: targetWidth, withoutEnlargement: false, kernel: "lanczos3" })
      .grayscale()
      .normalize();

    const { channels } = await sharp(await pipeline.clone().toBuffer()).stats();
    const meanLuma = channels[0]?.mean ?? 255;
    if (meanLuma < 115) {
      pipeline = pipeline.negate();
    }

    return await pipeline
      .linear(1.25, -12) // gentle contrast bump after the invert decision
      .sharpen()
      .png()
      .toBuffer();
  } catch (err) {
    console.error("[tipOcr] preprocess failed, using raw image:", err instanceof Error ? err.message : err);
    return buffer;
  }
}

async function recognize(buffer: Buffer): Promise<string | null> {
  const worker = await getWorker();
  const { data } = await Promise.race([
    worker.recognize(buffer),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("OCR timeout")), OCR_TIMEOUT_MS)),
  ]);
  const text = data.text?.trim();
  return text && text.length > 0 ? text : null;
}

/** Rough "did this read as real words" score — used only to decide whether
 *  the preprocessed pass was good enough or the raw image is worth a second
 *  try. Letters in runs of 3+ are the signal; stray punctuation isn't. */
function readableScore(text: string | null): number {
  if (!text) return 0;
  const wordish = text.match(/[A-Za-zÀ-ÿ]{3,}/g);
  return wordish ? wordish.join("").length : 0;
}

/**
 * Downloads a message's photo and OCRs it. Returns null on anything that
 * isn't a recoverable photo or produces no readable text — bet-slip
 * screenshots vary wildly in font/contrast, so a failed read is expected,
 * not exceptional.
 *
 * Two passes: the preprocessed image first, then the raw bytes as a
 * fallback if the first pass came back thin — some already-high-contrast
 * slips actually OCR better without the upscale/sharpen, so neither order
 * wins every time and the better of the two is kept.
 *
 * A corrupted/truncated download occasionally makes tesseract.js's
 * underlying worker_threads Worker hang or die without ever settling the
 * recognize() promise (see worker/index.ts's uncaughtException handler for
 * the crash half of this) — the race in recognize() bounds that hang, and
 * dropping the cached worker forces a fresh one next call in case the
 * shared worker itself is now wedged.
 */
export interface OcrResult {
  text: string | null;
  /** Raw downloaded image bytes — kept so downstream (LLM vision fallback)
   *  can re-use the same download instead of pulling the photo twice. */
  imageBuffer: Buffer;
}

export async function extractTextFromPhoto(client: TelegramClient, message: Api.Message): Promise<OcrResult | null> {
  if (!message.photo) return null;

  const buffer = await client.downloadMedia(message, {});
  if (!buffer || typeof buffer === "string") return null;
  const raw = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  return withOcrLock(async () => {
    try {
      const processed = await preprocessForOcr(raw);
      const processedText = await recognize(processed);

      if (readableScore(processedText) >= 24) return { text: processedText, imageBuffer: raw };

      const rawText = await recognize(raw);
      const text = readableScore(rawText) > readableScore(processedText) ? rawText : processedText;
      return { text, imageBuffer: raw };
    } catch (err) {
      console.error("[tipOcr] OCR failed, resetting worker for next call:", err instanceof Error ? err.message : err);
      workerPromise = null;
      return { text: null, imageBuffer: raw };
    }
  });
}
