// Renders index.html frame by frame (deterministic window.render(t)) and pipes
// the frames to ffmpeg. Usage: node render.mjs [timing | preview t1,t2,...]
import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto("file://" + path.join(dir, "index.html"));
await page.evaluate(() => document.fonts.ready);
const timing = await page.evaluate(() => window.TIMING);

if (process.argv[2] === "timing") {
  writeFileSync(path.join(dir, "timing.json"), JSON.stringify(timing, null, 1));
  console.log("duration", timing.DURATION.toFixed(2), "scenes", JSON.stringify(timing.SCENES.map((s) => [s[0], +s[1].toFixed(2)])));
} else if (process.argv[2] === "preview") {
  for (const t of process.argv[3].split(",").map(Number)) {
    await page.evaluate((x) => window.render(x), t);
    await page.screenshot({ path: path.join(dir, `preview-${t}.png`) });
  }
} else {
  const out = path.join(dir, "video-silent.mp4");
  const ff = spawn("ffmpeg", ["-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out],
    { stdio: ["pipe", "ignore", "inherit"] });
  const frames = Math.ceil(FPS * timing.DURATION);
  for (let f = 0; f < frames; f++) {
    await page.evaluate((x) => window.render(x), f / FPS);
    const buf = await page.screenshot({ type: "jpeg", quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  console.log("written", out);
}
await browser.close();
