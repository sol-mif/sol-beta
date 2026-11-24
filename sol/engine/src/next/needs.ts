// next.needs: one ranked list of what waits on the person (#1604 slice 7, map.md #3 and #18; docs/port/notes/s7a.md).
// Behind ui.next (parts/next-calls.ts). Read only: it reads where each kind of ask lives today and writes nothing.
//   home.today    Home's Things that wait on the person, in Today's own order (home/today.ts todayOf; the stage's
//                 waiting blocks are Things there too while home.whole is on, linked "block:<project>/<id>")
//   work.perm     a running session's open permission (an item of kind "perm" in state "ask", work/runs.ts)
//   stage asks    a stage block that asks and is not answered (work/blocks.ts `asks`), unless Home already has it
//   drafts        an agent's sticky with a "did: draft: …" or "did: ask: …" line, not done (agent/stickies.ts WAITS)
// The rank is the face's (sol/mac/src/next/needs/rank.ts TIER and cv/wire/needs.ts): rank is computed, never claimed.
//   serious 1 · money 2 · holds 3 (a permission: the AI has stopped) · due 4 (a date) · other 6
// Inside a tier, each source's own order (Today's order, the sessions' order, the stage's, the folders'), sources in
// the order above, and a step of 0.01 each, kept below the next tier. The face takes `rank` as it is sent.
import { todayOf } from "../home/today.js";
import type { Ctx } from "../home/unit.js";

export type Need = {
  id: string; piece: string; words: string; kind: "code" | "life"; yes?: string;
  serious: boolean; due: number | null; rank: number; why: string;
  /** work is stopped until the person answers (a permission; a step an agent stopped before): never silent (next/raise.ts) */
  stopped?: boolean;
};
/** the face's tiers, the same numbers (needs/rank.ts TIER) */
export const TIER = { serious: 1, money: 2, holds: 3, due: 4, other: 6 } as const;
type Tier = keyof typeof TIER;

/** the inputs, as each store has them now (each list in its own order) */
export type TodayThing = { id: string; read: string; folder: string; words: string; state: string; waitsOn: string; due?: number; links?: string[]; card?: { title?: string; answers?: string[] } };
export type PermIn = { sessionId: string; title?: string; item: { id: string; tool?: string; input?: Record<string, unknown>; title?: string } };
export type StageIn = { project: string; id: string; title: string; q: string; choices: string[]; serious?: boolean };
export type DraftIn = { folder: string; sticky: string; line: string; due?: number };
export type NeedsIn = { things: TodayThing[]; perms: PermIn[]; stage: StageIn[]; drafts: DraftIn[] };

const MONEY = /\$\d|spending limit|\bpay\b/i;
const one = (s: string, max = 140) => s.replace(/\s+/g, " ").trim().slice(0, max);

/** the one list, ranked (pure: the same inputs give the same list) */
export function rankNeeds(i: NeedsIn): Need[] {
  const out: (Omit<Need, "rank"> & { tier: Tier })[] = [];
  const homeBlocks = new Set(i.things.flatMap((t) => (t.links ?? []).filter((l) => l.startsWith("block:"))));
  for (const p of i.perms) {
    const it = p.item;
    const what = it.tool === "Bash" && typeof it.input?.command === "string" ? `run ${String(it.input.command).slice(0, 80)}` : it.title || `use ${it.tool ?? "a tool"}`;
    out.push({ id: `p:${p.sessionId}:${it.id}`, piece: p.sessionId, words: `allow ${what}?`, kind: "code", yes: "Allow", serious: false, due: null, stopped: true, tier: "holds", why: `${it.tool ?? "a tool"} · permission: the session has stopped until you answer` });
  }
  for (const t of i.things) {
    const tier: Tier = t.due ? "due" : "other";   // the face's fromThing, exactly
    out.push({ id: `t:${t.id}`, piece: t.folder || "home", words: t.words, kind: t.read === "job" ? "code" : "life", ...(t.card?.answers?.[0] ? { yes: t.card.answers[0] } : {}),
      serious: false, due: t.due ?? null, tier, why: t.card?.title ? `${t.folder || "Home"} · ${t.card.title}` : t.folder || "Home" });
  }
  for (const b of i.stage) {
    if (homeBlocks.has(`block:${b.project}/${b.id}`)) continue;   // Home has it already: one ask, one row
    out.push({ id: `s:${b.project}/${b.id}`, piece: b.project, words: one(b.q || b.title), kind: "code", ...(b.choices[0] ? { yes: b.choices[0] } : {}),
      serious: !!b.serious, due: null, tier: b.serious ? "serious" : MONEY.test(b.q) ? "money" : "other", why: `${b.project} · ${one(b.title, 60)}` });
  }
  for (const d of i.drafts) {
    const ask = /^did:\s*ask:/i.test(d.line), words = one(d.line.replace(/^did:\s*(draft|ask):\s*/i, ""));
    out.push({ id: `d:${d.folder}:${d.sticky}`, piece: d.folder, words, kind: "life", yes: ask ? "Do it" : "Keep it",
      serious: false, due: d.due ?? null, ...(ask ? { stopped: true } : {}), tier: MONEY.test(words) ? "money" : d.due ? "due" : "other", why: `${d.folder} · ${ask ? "it stopped before the step" : "a draft waits to be kept"}` });
  }
  const seen: Partial<Record<Tier, number>> = {};
  const ranked = out.map((n) => { const k = seen[n.tier] ?? 0; seen[n.tier] = k + 1; const { tier, ...rest } = n; return { ...rest, rank: Math.round((TIER[tier] + Math.min(k, 99) * 0.01) * 100) / 100 }; });
  // stable: by tier, then each source's own order as pushed above
  return ranked.map((n, ix) => ({ n, ix })).sort((a, b) => Math.floor(a.n.rank) - Math.floor(b.n.rank) || a.ix - b.ix).map((x) => x.n);
}

/** what each store has now, read only. Each reader is given so a test (or an engine without one of them) passes its own */
export type NeedsRead = { home?: () => Ctx | null; perms?: () => PermIn[]; stage?: () => StageIn[]; drafts?: () => DraftIn[] };
export function gather(r: NeedsRead): NeedsIn {
  const ctx = r.home?.() ?? null;
  let things: TodayThing[] = [];
  if (ctx) {
    const msg = todayOf(ctx).msg, by = new Map(msg.things.map((t) => [t.id, t as unknown as TodayThing]));
    things = msg.today.needs.map((id) => by.get(id)).filter((t): t is TodayThing => !!t && t.waitsOn === "you" && t.state !== "done");
  }
  const safe = <T>(f?: () => T[]): T[] => { try { return f?.() ?? []; } catch { return []; } };
  return { things, perms: safe(r.perms), stage: safe(r.stage), drafts: safe(r.drafts) };
}
export const needsNow = (r: NeedsRead): Need[] => rankNeeds(gather(r));
