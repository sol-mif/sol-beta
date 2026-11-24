// next.call, next.undo, next.needs, next.seats, next.back: the new face's calls, needs and seats (#1604 slice 7a;
// PROTOCOL.md "next (the new face, behind ui.next)" › "calls, needs, seats"; docs/port/notes/s7a.md). Everything is
// behind ui.next (settings.ts uiNext(), read on every message): off, no message here is answered, and nothing is read
// or written. On, only Sol's own windows are answered (as Home: these read and write a person's own things); any
// other connection hears {ok:false, why} and nothing is read.
// Exact types only, never the "next." prefix: slice 7b's part answers its own next.* types beside this one.
import { relative } from "node:path";
import type { Parts } from "../parts.js";
import { getSettings, patchSettings, uiNext } from "../settings.js";
import { homeNow } from "../home/wire.js";
import type { Ctx } from "../home/unit.js";
import { keptWithSeats, onConnectionsChanged } from "../connections.js";
import { call, undo } from "../next/calls.js";
import { needsNow, type DraftIn, type Need, type PermIn, type StageIn } from "../next/needs.js";
import { BACK_WORDS, doneOf, goBack, readBack, seatsOf, type Ai } from "../next/seats.js";
import { becauseOf } from "../next/you-known.js";

/** the Home the gate and the needs read: the live one (null while home.whole or the frame is off); a test's own */
let home: () => Ctx | null = homeNow;
export function useHome(f: () => Ctx | null): () => void { const was = home; home = f; return () => { home = was; }; }

const REFUSED = "only Sol's own windows";

/** the live stores, read only, imported when first asked (they carry the seats; a test of this part never loads them) */
async function readers() {
  const [{ allRuns }, blocks, agents, stickies] = await Promise.all([import("../work/runs.js"), import("../work/blocks.js"), import("../agent/index.js"), import("../agent/stickies.js")]);
  const perms = (): PermIn[] => allRuns().flatMap((r) => r.items.list.filter((i) => i.kind === "perm" && i.state === "ask")
    .map((i) => ({ sessionId: r.id, item: { id: i.id, ...(typeof i.tool === "string" ? { tool: i.tool } : {}), ...(i.input && typeof i.input === "object" ? { input: i.input as Record<string, unknown> } : {}), ...(typeof i.title === "string" ? { title: i.title } : {}) } })));
  const stage = (): StageIn[] => blocks.projects().flatMap((p) => blocks.allBlocks(p).filter((b) => b.asks && !b.asks.answer)
    .map((b) => ({ project: p, id: b.id, title: b.title, q: b.asks!.q, choices: b.asks!.choices })));
  const folders = () => { const a = agents.agentsNow(); return a ? a.folders().map((f) => ({ folder: relative(a.d.home, f.path).split("\\").join("/"), path: f.path })) : []; };
  const drafts = (): DraftIn[] => folders().flatMap(({ folder, path }) => stickies.read(path).items.filter((m) => !m.done)
    .flatMap((m) => { const line = [...m.notes].reverse().find((n) => stickies.WAITS.test(n)); return line ? [{ folder, sticky: stickies.keyOf(m.t), line }] : []; }));
  // which AI runs on which seat: folder agents on Codex (agent/run.ts), Work on Claude, Home on its setting's seat
  const ais = (): Ai[] => [
    { ai: "Work", seat: "claude" }, { ai: "Home", seat: getSettings().defaults.seat },
    ...folders().map(({ folder }) => ({ ai: folder, seat: "codex" as const, folder })),
  ];
  return { perms, stage, drafts, ais };
}
let R: Awaited<ReturnType<typeof readers>> | null = null;
const live = async () => (R ??= await readers());
/** the stores a test gives instead (none: the live ones) */
let given: Partial<Awaited<ReturnType<typeof readers>>> | null = null;
export function useReaders(r: typeof given): () => void { const was = given; given = r; return () => { given = was; }; }
const read = async () => (given ? { perms: () => [], stage: () => [], drafts: () => [], ais: () => [], ...given } : live());

/** the ranked list as next.needs answers it, for next.state's answer to one of Sol's own windows (parts/next.ts). With
 *  the SOL home, a session's ask says why the session knew what it knew: `because`, the keys of the facts its first turn
 *  told (next.session.told); a session told nothing has none */
/** more candidates for the one list, each a part's own (builder T's tidy offers, "o:<kind>:<to>", parts/next-tidy.ts):
 *  added when the part loads, read per home, never throwing. They are judged like any ask (next/raise.ts, next.raises),
 *  so the judgment, not their place in the list, decides whether they are raised (BR1 #1615, builder J) */
export type MoreNeed = Need & { no?: string; because?: string[]; offer?: unknown };
const more: ((sol: string) => MoreNeed[])[] = [];
export function addNeeds(f: (sol: string) => MoreNeed[]): () => void { more.push(f); return () => { const i = more.indexOf(f); if (i >= 0) more.splice(i, 1); }; }
const moreOf = (sol: string): MoreNeed[] => more.flatMap((f) => { try { const r = f(sol); return Array.isArray(r) ? r : []; } catch { return []; } });

export async function needsList(sol?: string): Promise<unknown[]> {
  const r = await read();
  const needs = needsNow({ home, perms: r.perms, stage: r.stage, drafts: r.drafts });
  if (!sol) return needs;
  const own = needs.map((n) => { const because = n.id.startsWith("p:") ? becauseOf(sol, n.piece) : []; return because.length ? { ...n, because } : n; });
  // the sort offered after the move-in (builder T, parts/next-tidy.ts), loaded when first asked; that part may also add
  // itself by addNeeds, so an ask is kept once by its id: either way in, or both, lists each offer once
  const tidy: MoreNeed[] = await import("./next-tidy.js").then((m) => m.tidyNeeds(sol, own.length) as MoreNeed[], () => []);
  const seen = new Set<string>();
  return [...own, ...tidy, ...moreOf(sol)].filter((n) => !seen.has(n.id) && !!seen.add(n.id)).sort((a, b) => a.rank - b.rank);
}

export default function (p: Parts) {
  /** a message of this part: answered only while ui.next is on, and only to Sol's own windows */
  const hear = (type: string, f: (msg: any, h: Parameters<Parameters<Parts["on"]>[1]>[1]) => Promise<object | null>) =>
    p.on(type, async (msg, h) => {
      if (!uiNext()) return;
      const rid = msg?.rid !== undefined ? { rid: msg.rid } : {};
      if (!h.fromSol) return h.face.send({ type, ...rid, ok: false, why: REFUSED });
      const out = await f(msg, h);
      if (out) h.face.send({ type, ...rid, ...out });
    });

  hear("next.call", async (msg) => {
    const ctx = home();
    if (!ctx) return { ok: false, why: "home is off" };
    return call(ctx, { ai: msg.ai, fn: msg.fn, args: msg.args, thing: msg.thing });
  });
  hear("next.undo", async (msg) => {
    const ctx = home();
    if (!ctx) return { ok: false, why: "home is off" };
    return undo(ctx, { id: msg.id }, typeof msg.ai === "string" ? msg.ai : "you");
  });
  hear("next.needs", async (_m, h) => ({ needs: await needsList(h.HOME) }));
  hear("next.seats", async () => {
    const r = await read();
    const { type: _t, ...m } = seatsOf(keptWithSeats(), r.ais(), Date.now());
    return m;
  });
  hear("next.back", async (msg, h) => {
    if (msg.confirm !== true) return { confirm: BACK_WORDS, back: readBack(h.HOME) };
    const b = goBack(h.HOME, Date.now(), uiNext(), () => { patchSettings({ ui: { next: false } }); });
    return { done: true, back: b };
  });

  // a sign-in learned done: the Seats screen again to every window, while the new face is on
  p.atStart((e) => {
    onConnectionsChanged(async (ids) => {
      if (!uiNext()) return;
      const rows = keptWithSeats(), r = await read();
      e.everyone({ ...seatsOf(rows, r.ais(), Date.now()), changed: ids, done: doneOf(rows, ids) });
    });
  });
}
