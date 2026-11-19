// Asking Jev for Jelly across screens (#1090): posts one of screensJev.ts's bodies to JEV_URL with the agent's key
// (agent/jev.ts) and hands back the answers, or null: no key, an error, or no answer within the budget. Never logs the key.
import { jevKey, JEV_URL } from "./agent/jev.js";

export async function askJev(body: object, o: { fetch?: typeof fetch; key?: string | null; budget?: number } = {}): Promise<Record<string, unknown> | null> {
  const key = o.key !== undefined ? o.key : jevKey();
  if (!key) return null;
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), o.budget ?? 4000);
  try {
    const r = await (o.fetch ?? fetch)(JEV_URL, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: ac.signal });
    if (!r.ok) return null;
    const j = (await r.json()) as { answers?: Record<string, unknown> };
    return j?.answers ?? null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}
