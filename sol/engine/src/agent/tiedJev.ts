// Home's world (#1093), Jev's pick 4: are two things tied? The face asks `agent.tied` with the two things' names and
// kinds and on how many days he opened them within a minute of each other (from the world's own record). Jev answers
// a `noul`. Never acted on by itself: 0.45 and over shows a dashed line between the two he can press to keep (a line in
// world.md); under, nothing. Names, kinds and a count only. No key, an error or over 4 s: null, nothing shows.
import { JEV_URL, jevKey } from "./jev.js";

export type Pair = { a: { name: string; kind: string }; b: { name: string; kind: string }; days: number };
const clean = (x: { name: string; kind: string }) => ({ name: String(x?.name ?? "").slice(0, 80), kind: String(x?.kind ?? "").slice(0, 20) });
/** the request (pure): two names and kinds and a count */
export function tiedBody(p: Pair) {
  const a = clean(p.a), b = clean(p.b);
  return {
    model: "jev-latest",
    state: { first: `${a.name} (${a.kind})`, second: `${b.name} (${b.kind})`, days_opened_together: String(Math.max(0, Math.floor(p.days))) },
    questions: {
      tied: {
        type: "noul",
        instructions: "The person opened these two things within a minute of each other on several days. Does one feed the other, so they belong together?",
        criteria: { true: "one is the work or the source of the other (a class and the project for it, a job and its application)", false: "they are unrelated and only happened to be opened at the same time" },
      },
    },
  };
}
export function tiedSaid(json: any): number | null {
  const v = Number(json?.answers?.tied?.noul);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null;
}
export async function askTied(p: Pair, o: { key?: string | null; fetch?: typeof fetch; budget?: number } = {}): Promise<number | null> {
  const key = o.key !== undefined ? o.key : jevKey();
  if (!key || !p?.a?.name || !p?.b?.name || p.days < 3) return null;
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), o.budget ?? 4000);
  try {
    const r = await (o.fetch ?? fetch)(JEV_URL, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(tiedBody(p)), signal: ac.signal });
    return r.ok ? tiedSaid(await r.json()) : null;
  } catch { return null; } finally { clearTimeout(t); }
}
