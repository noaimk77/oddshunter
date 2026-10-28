"""Overlay v190: slip reading survives a Gemini overload.

Applies on top of the production v189 tipLlmFallback.ts.
Usage: python3 patch_v190.py <root>

Real miss 2026-10-28 18:41 Paris: FixHunter's "W1" Team Spirit vs Natus
Vincere slip went unread. In the same minutes the chain answered: flash-lite
timed out, 3.1-flash-lite 503 ("high demand… try again later"), the two flash
models 429 (free quota). Two changes to callGemini:
- when a model timed out or was overloaded, the whole chain is tried once more
  20 s later instead of giving up on the slip;
- Claude (ANTHROPIC_API_KEY) is the last link, same prompt and JSON reply. The
  key on the worker was refused (401) on 2026-10-28: the first 401 turns this
  link off until the next restart, so it costs nothing until a valid key is set.
"""
import sys
root = sys.argv[1]
rel = "src/worker/telegram/tipLlmFallback.ts"
p = f"{root}/{rel}"
s = open(p).read()
if "callClaude" in s:
    sys.exit(f"{rel}: already patched")

# The current callGemini, from its doc comment to its closing brace, is replaced whole.
start = s.find("/**\n * One logical Gemini generateContent call")
fn = s.find("async function callGemini(", start)
end = s.find("\n}\n", fn)
if start < 0 or fn < 0 or end < 0 or s.count("async function callGemini(") != 1:
    sys.exit(f"{rel}: callGemini not found where expected")
old_fn = s[start:end + 3]
for needed in ("MODEL_FALLTHROUGH_STATUSES.has(res.status)", "maybeNotifyAuthFailure(429, \"quota\")", "AbortSignal.timeout(LLM_TIMEOUT_MS)"):
    if needed not in old_fn:
        sys.exit(f"{rel}: callGemini changed in production ({needed!r} missing)")

new_fn = '''const CLAUDE_MODEL = "claude-opus-5-5";
let anthropic: Anthropic | null | undefined;

/**
 * Claude as the last link of the chain, when no Gemini model answered
 * (2026-10-28: overload and quota on every model, FixHunter's Team Spirit slip
 * went unread). Same prompt, same JSON reply; low effort, it only reads a
 * slip. A refused key turns this link off until the next restart. null
 * without a usable ANTHROPIC_API_KEY or on any failure. Never throws.
 */
async function callClaude(args: { system: string; userText: string; imageBuffer?: Buffer; tag: string }): Promise<string | null> {
  if (anthropic === undefined) anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ timeout: LLM_TIMEOUT_MS, maxRetries: 1 }) : null;
  if (!anthropic) return null;
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (args.imageBuffer && args.imageBuffer.length > 0 && args.imageBuffer.length < 5 * 1024 * 1024) {
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: args.imageBuffer.toString("base64") } });
  }
  content.push({ type: "text", text: `${args.userText}\\n\\nRéponds uniquement avec le JSON demandé, sans texte autour.` });
  try {
    const res = await anthropic.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      output_config: { effort: "low" },
      // A safety decline is re-run on a fallback model inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: args.system,
      messages: [{ role: "user", content }],
    });
    if (res.stop_reason === "refusal") return null;
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    if (text) console.log(`[${args.tag}] no Gemini model answered — read by Claude.`);
    return text || null;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.warn(`[${args.tag}] ANTHROPIC_API_KEY refused (401): Claude fallback off until restart.`);
      anthropic = null;
    } else if (err instanceof Anthropic.APIError) {
      console.warn(`[${args.tag}] Claude HTTP ${err.status}: ${err.message.slice(0, 160)}`);
    } else {
      console.warn(`[${args.tag}] Claude call failed:`, err instanceof Error ? err.message : err);
    }
    return null;
  }
}

/** Gemini's own 503 text says overload is "usually temporary": one more pass after this. */
const GEMINI_RETRY_DELAY_MS = 20_000;

type GeminiPass = { text: string | null; sawQuota: boolean; transient: boolean; fatal: boolean };

/**
 * One pass over the model chain. `transient`: a model timed out or was
 * overloaded (503), worth another pass. `fatal`: the key or request itself is
 * rejected (400/401/403) — no model will do better.
 */
async function geminiPass(apiKey: string, models: string[], body: string, tag: string): Promise<GeminiPass> {
  let sawQuota = false;
  let transient = false;
  for (const model of models) {
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        // Key in a header, not the URL — keeps it out of any logged URL.
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body,
        signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      });
    } catch (err) {
      console.warn(`[${tag}] Gemini ${model} call failed:`, err instanceof Error ? err.message : err);
      transient = true;
      continue; // timeout / network blip on this model — try the next
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.warn(`[${tag}] Gemini ${model} HTTP ${res.status}: ${errBody.slice(0, 160).replace(/\\s+/g, " ")}`);
      if (res.status === 429) sawQuota = true;
      if (res.status === 503) transient = true;
      if (MODEL_FALLTHROUGH_STATUSES.has(res.status)) continue;
      void maybeNotifyAuthFailure(res.status, errBody);
      return { text: null, sawQuota, transient: false, fatal: true };
    }

    let json: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    try {
      json = await res.json();
    } catch {
      continue;
    }
    const text = (json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "").trim();
    if (text) return { text, sawQuota, transient, fatal: false };
    // Empty answer (safety block / no candidates) — try the next model.
  }
  return { text: null, sawQuota, transient, fatal: false };
}

/**
 * One logical vision call: the Gemini chain (a second pass 20 s later when a
 * model was only overloaded or slow), then Claude. Returns the model's raw
 * text (expected to be JSON) or null when nothing answered. Never throws.
 */
async function callGemini(args: { system: string; userText: string; imageBuffer?: Buffer; maxTokens: number; tag: string }): Promise<string | null> {
  const { apiKey, models } = getTipLlmFallbackConfig();
  if (!apiKey) return null;

  const parts: Array<Record<string, unknown>> = [];
  if (args.imageBuffer && args.imageBuffer.length > 0 && args.imageBuffer.length < 5 * 1024 * 1024) {
    parts.push({ inline_data: { mime_type: "image/jpeg", data: args.imageBuffer.toString("base64") } });
  }
  parts.push({ text: args.userText });

  const body = JSON.stringify({
    system_instruction: { parts: [{ text: args.system }] },
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0, maxOutputTokens: args.maxTokens, responseMimeType: "application/json" },
  });

  let pass = await geminiPass(apiKey, models, body, args.tag);
  if (!pass.text && pass.transient && !pass.fatal) {
    console.warn(`[${args.tag}] Gemini overloaded or slow — one more pass in ${GEMINI_RETRY_DELAY_MS / 1000}s.`);
    await new Promise((resolve) => setTimeout(resolve, GEMINI_RETRY_DELAY_MS));
    const again = await geminiPass(apiKey, models, body, args.tag);
    pass = { ...again, sawQuota: pass.sawQuota || again.sawQuota };
  }
  if (pass.text) return pass.text;

  // No Gemini model answered: Claude reads the same thing before giving up.
  const claude = await callClaude(args);
  if (claude) return claude;
  if (pass.sawQuota) void maybeNotifyAuthFailure(429, "quota");
  llmFailureCount++;
  return null;
}
'''

s = s[:start] + new_fn + s[end + 3:]
imp = 'import { getTipLlmFallbackConfig, TIP_LLM_FALLBACK_ENABLED } from "../config";'
if s.count(imp) != 1:
    sys.exit(f"{rel}: config import not found")
s = s.replace(imp, 'import Anthropic from "@anthropic-ai/sdk";\n' + imp)
open(p, "w").write(s)
print("patched", rel)
