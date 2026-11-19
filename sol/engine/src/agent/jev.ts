// Jev (TypeSafe's System One) as the folder agent's judge: one yes/no question per rule, "does this rule cover what the
// source saw?", answered as a probability. The key is JEV_API_KEY, else the line JEV_API_KEY=… in ~/.config/sol/jev.env;
// it is never logged. No key, past the budget, or any error: null, and the judge falls back to the rule's source.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Jev } from "./harness.js";
import { isQuiet } from "../quiet.js";

export const JEV_URL = "https://api.typesafe.ai/v1/systemone";

let keyOnce: string | null | undefined;
export function jevKey(): string | null {
  if (isQuiet()) return null;   // a quiet Sol asks Jev nothing: each call is paid and leaves this Mac (#1293)
  if (keyOnce !== undefined) return keyOnce;
  const env = (process.env.JEV_API_KEY ?? "").trim();
  if (env) return (keyOnce = env);
  try {
    const line = readFileSync(join(homedir(), ".config", "sol", "jev.env"), "utf8").split("\n").find((l) => /^\s*(export\s+)?JEV_API_KEY\s*=/.test(l));
    keyOnce = line?.replace(/^\s*(export\s+)?JEV_API_KEY\s*=\s*/, "").trim().replace(/^(["'])(.*)\1$/, "$2") || null;
  } catch { keyOnce = null; }
  return keyOnce;
}

/** the request (pure): what the source saw, the rule, and one noul question */
export function jevBody(rule: { sentence: string; source: string }, trigger: { source: string; kind: string; data: Record<string, unknown> }) {
  return {
    model: "jev-latest",
    state: {
      rule: `${rule.source}: ${rule.sentence}`.slice(0, 600),
      seen: `${trigger.source} ${trigger.kind}: ${JSON.stringify(trigger.data).slice(0, 1200)}`,
    },
    questions: {
      covers: {
        type: "noul",
        instructions: "Does this rule ask for work on what the source just saw?",
        criteria: { true: "what was seen is what the rule watches for: new or changed course items, a new file, its time", false: "noise: nothing the rule asks about, a page that only moved, an empty change" },
      },
    },
  };
}

export function makeJev(o: { fetch?: typeof fetch; key?: string | null; budget?: number } = {}): Jev | null {
  const key = o.key !== undefined ? o.key : jevKey();
  if (!key) return null;
  const f = o.fetch ?? fetch;
  return async ({ rule, trigger }) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), o.budget ?? 4000);
    try {
      const r = await f(JEV_URL, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(jevBody(rule, trigger)), signal: ac.signal });
      if (!r.ok) return null;
      const p = (await r.json() as any)?.answers?.covers?.noul;
      return typeof p === "number" && Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : null;
    } catch { return null; }
    finally { clearTimeout(timer); }
  };
}
