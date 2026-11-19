// Home's world (#1093), Jev's pick 5: where the world opens. The face asks `agent.opens` once when the world opens with
// the hour, the titles of what waits and what works, the districts (its parts and "edge", the front edge), and the last
// places he went at about this hour on other days (from the world's own record, district names only). Jev answers a
// `choice` among the districts. 0.7 and over: the first view leans there; 0.45 and over: a dashed ring on its name he
// can press; under: the island whole. No key, an error or over 4 s: null, and the island opens whole.
import { JEV_URL, jevKey } from "./jev.js";

export type Opens = { hour: number; waiting: string[]; working: string[]; places: { id: string; name: string }[]; recent: string[] };

/** the request (pure): titles and names only, never a note */
export function opensBody(o: Opens) {
  const list = (l: string[]) => l.slice(0, 8).map((x) => x.slice(0, 80)).join("; ") || "nothing";
  return {
    model: "jev-latest",
    state: {
      hour: String(Math.max(0, Math.min(23, Math.floor(o.hour)))),
      waiting: list(o.waiting),
      working: list(o.working),
      recent_at_this_hour: o.recent.slice(-5).join("; ") || "no record yet",
    },
    questions: {
      opens: {
        type: "choice",
        instructions: "The person opens their world now. Which place should it open on? Pick the front edge when something waits for them; otherwise where they usually go at this hour.",
        criteria: Object.fromEntries(o.places.map((p) => [p.id, (p.id === "edge" ? "the front edge: when things wait for the person" : `${p.name}: when they usually go there at this hour, or its work is what matters now`).slice(0, 300)])),
      },
    },
  };
}
/** the answer (pure): { part, confidence } when Jev chose one of the places, else null */
export function opensSaid(json: any, places: { id: string }[]): { part: string; confidence: number } | null {
  const a = json?.answers?.opens, c = Number(a?.confidence);
  if (!a || typeof a.choice !== "string" || !places.some((p) => p.id === a.choice) || !Number.isFinite(c)) return null;
  return { part: a.choice, confidence: Math.min(1, Math.max(0, c)) };
}
export async function askOpens(o: Opens, x: { key?: string | null; fetch?: typeof fetch; budget?: number } = {}) {
  const key = x.key !== undefined ? x.key : jevKey();
  if (!key || o.places.length < 2) return null;
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), x.budget ?? 4000);
  try {
    const r = await (x.fetch ?? fetch)(JEV_URL, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(opensBody(o)), signal: ac.signal });
    return r.ok ? opensSaid(await r.json(), o.places) : null;
  } catch { return null; } finally { clearTimeout(t); }
}
