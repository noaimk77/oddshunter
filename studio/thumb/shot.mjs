import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto("file://" + process.cwd() + "/thumb.html"); await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: "laos-2026-miniature.jpg", type: "jpeg", quality: 92 }); await b.close();
