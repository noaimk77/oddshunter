// Renders index.html frame by frame (deterministic window.render(t)) and pipes
// the frames to ffmpeg. Usage:
//   node render.mjs timing | preview t1,t2,... | part <index> <count>
import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30, W = 1920, H = 1080;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto("file://" + path.join(dir, "index.html"));
await page.evaluate(() => document.fonts.ready);
const timing = await page.evaluate(() => window.TIMING);
const [mode, a1, a2] = process.argv.slice(2);

if (mode === "timing") {
  writeFileSync(path.join(dir, "timing.json"), JSON.stringify(timing, null, 1));
  console.log("duration", timing.DURATION.toFixed(2), JSON.stringify(timing.SCENES.map((s) => [s[0], +s[1].toFixed(1)])));
} else if (mode === "preview") {
  for (const t of a1.split(",").map(Number)) {
    await page.evaluate((x) => window.render(x), t);
    await page.screenshot({ path: path.join(dir, `preview-${t}.png`) });
  }
} else {
  // part <index> <count>: render a contiguous slice of frames so slices can run in parallel
  const total = Math.ceil(FPS * timing.DURATION), idx = Number(a1 || 0), count = Number(a2 || 1);
  const from = Math.floor(total * idx / count), to = Math.floor(total * (idx + 1) / count);
  const out = path.join(dir, `part-${idx}.mp4`);
  const ff = spawn("ffmpeg", ["-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", out],
    { stdio: ["pipe", "ignore", "ignore"] });
  for (let f = from; f < to; f++) {
    await page.evaluate((x) => window.render(x), f / FPS);
    const buf = await page.screenshot({ type: "jpeg", quality: 90 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  console.log("written", out, from, to);
}
await browser.close();
