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
  // stand-in for the footage so the transparent overlay is readable in a screenshot
  await page.addStyleTag({ content: "html,body,#stage{background:linear-gradient(135deg,#6b5a48,#2c3440 60%,#151a20) !important}" });
  for (const t of a1.split(",").map(Number)) {
    await page.evaluate((x) => window.render(x), t);
    await page.screenshot({ path: path.join(dir, `preview-${t}.png`) });
  }
} else {
  // part <index> <count>: render a contiguous slice of frames so slices can run in parallel
  const total = Math.ceil(FPS * timing.DURATION), idx = Number(a1 || 0), count = Number(a2 || 1);
  const from = Math.floor(total * idx / count), to = Math.floor(total * (idx + 1) / count);
  const out = path.join(dir, `part-${idx}.mp4`);
  // transparent PNG frames -> VP9 with alpha, composited over the footage in the sandbox
  const out2 = out.replace(".mp4", ".webm");
  const ff = spawn("ffmpeg", ["-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "30", "-deadline", "good", "-cpu-used", "5", "-row-mt", "1", "-auto-alt-ref", "0", out2],
    { stdio: ["pipe", "ignore", "ignore"] });
  for (let f = from; f < to; f++) {
    await page.evaluate((x) => window.render(x), f / FPS);
    const buf = await page.screenshot({ type: "png", omitBackground: true });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  console.log("written", out2, from, to);
}
await browser.close();
