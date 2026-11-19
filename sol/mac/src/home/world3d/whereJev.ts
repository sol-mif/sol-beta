// Home's world (#1093): Jev's pick 1 asked through the engine (agent.where, sol/engine/src/agent/whereJev.ts): which
// folder a sticky dropped on open ground belongs in. 4 s at most; no answer or no key: null, the tile glides back.
type Ask = <T>(o: object, ms: number) => Promise<T | null>;
export async function whereJev(ask: Ask, sticky: string, folders: { id: string; name: string; things: string[] }[]): Promise<{ folder: string; confidence: number } | null> {
  if (folders.length < 2) return null;
  const r = await ask<{ ok?: boolean; folder?: string | null; confidence?: number }>({ type: "agent.where", sticky, folders }, 4500);
  if (!r?.ok || !r.folder || typeof r.confidence !== "number" || !folders.some((f) => f.id === r.folder)) return null;
  return { folder: r.folder, confidence: r.confidence };
}
/** Jev's pick 2 (agent.first): which waiting thing stands first on the front edge; null: the scene's own order */
export async function firstJev(ask: Ask, things: { id: string; words: string; age: string; behind: string }[]): Promise<{ first: string; confidence: number } | null> {
  if (things.length < 2) return null;
  const r = await ask<{ ok?: boolean; first?: string | null; confidence?: number }>({ type: "agent.first", things }, 4500);
  if (!r?.ok || !r.first || typeof r.confidence !== "number" || !things.some((t) => t.id === r.first)) return null;
  return { first: r.first, confidence: r.confidence };
}
/** Jev's pick 6 (agent.form): what a folder stands as when its name does not say; null: the plain box */
export async function formJev(ask: Ask, f: { name: string; part: string; things: string[] }): Promise<{ form: string; confidence: number } | null> {
  const r = await ask<{ ok?: boolean; form?: string | null; confidence?: number }>({ type: "agent.form", ...f }, 4500);
  return r?.ok && r.form && typeof r.confidence === "number" ? { form: r.form, confidence: r.confidence } : null;
}
