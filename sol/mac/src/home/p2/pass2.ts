// Home's pass 2 (#692, sol/design/home/pass2.md): the shapes of engine.md's "Pass 2" sections as the face reads them,
// and the hook. Drawn today only as the stage's Home block (sol://home, HomeBlock.tsx; stage.html?home=1).
// The engine half is the stand-in (sol/design/home/stage/p2), on Home's own link (wire.ts homeAddr: 127.0.0.1:7791 by
// default), so Marco's real engine on 7777 is never touched. Frank's engine (#693) takes its place with no change here.
//
// Who owns what (the pass 2 build, 2026-11-08): this file, Home2.tsx and p2.css are the integrator's. A slice adds its
// fields only inside its own block of Home2State below and its calls in its own file (dump.ts, folders.ts, …).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { HomeState } from "./wire";

// ---- the shapes (engine.md, "Pass 2: the delta" and "Pass 2, after the rethink and the hand moves") ----
export type Agent = "codex" | "claude";
export type Dial = "read" | "propose" | "draft" | "act";
export const DIALS: Dial[] = ["read", "propose", "draft", "act"];
export type CtxKind = "file" | "site" | "person" | "note" | "said" | "learned";
export type Ctx = { id: string; folder: string; kind: CtxKind; name: string; line: string; from: "drop" | "link" | "said" | "learned" | "viewer" | "seed"; path?: string; url?: string; kept: boolean | null; at: string; carry?: boolean; bytes?: number };
export type Folder = {
  id: string; slug: string; name: string; parent: string | null;
  /** the names from home down to it: ["school", "bio 201"] */
  crumb: string[];
  agent: Agent | null; dial: Dial; rule: string; tools: string[];
  /** "automations" for the automations folder, "type" for a folder inside it (on a time, when something arrives, around my calendar) */
  kind?: "automations" | "type";
  archived?: boolean;
  /** its jobs that wait on him, and that run, its children's included */
  counts: { waits: number; running: number };
};
export type StepKind = "step" | "read" | "write" | "made" | "ask" | "learn" | "error";
export type StepLine = { at: string; line: string; n?: number; of?: number; kind: StepKind; agent?: Agent };
export type Doubt = { span: string; why: string; alts: string[] };
export type Back = { made_from: string[]; under: { folder: string; dial: Dial }; agent: Agent; model: string; took_ms: number; doubts: Doubt[]; undo: string | null };
export type Made = { id: string; sticky: string; folder: string; kind: "note" | "draft" | "event" | "page"; path: string; title: string; at: string; back?: Back };
export type StickyState = "filed" | "queued" | "running" | "asks" | "done" | "failed" | "paused" | "later" | "note" | "dropped";
export type Sticky = {
  id: string; text: string; folder: string; when: string | null; at: string;
  from: "dump" | "ahead" | "automation" | "hand" | "viewer";
  filing: { folder: string; alt?: string; ms: number; why: string };
  sort: "needs_me" | "can_do";
  state: StickyState; agent: Agent; steps: StepLine[]; made: Made[];
  ask?: { q: string; options: string[] };
  /** the dump line it was read from */
  line?: string;
  /** why it cannot start, said on the sticky */
  why?: string;
};
export type DumpLine = { id: string; text: string; at: string; sticky?: string; sort?: Sticky["sort"]; why?: string };
export type LogLine = { at: string; line: string; sticky?: string; kind?: StepKind | "ok" | "fail" };
export type Proposal = { id: string; kind: "block" | "sticky"; from: { kind: "event" | "mail" | "file"; id: string; title: string }; folder: string; title: string; start?: string; end?: string; state: "proposed" | "kept" | "declined" };
// p2: since needs this (folder, made and undone on a line: where a run line opens, and an act struck through once undone)
export type SinceLine = { id: string; kind: "act" | "run" | "ask" | "build"; text: string; act?: string; job?: string; session?: string; undo?: boolean; options?: string[]; at: string; folder?: string; made?: { id: string; path: string; title: string }; undone?: boolean };
export type WorldNode = { id: string; kind: "folder" | "calendar" | "mail" | "build" | "phone"; name: string; count?: string };
export type Stream = { id: string; from: string; to: string; weight: 0 | 1 | 2 | 3; used: string[] };
export type WorldLine = { id: string; kind: "preference" | "voice" | "hours" | "learned"; text: string; from: string; kept: boolean | null; folder?: string };

/** an automation (pieces/automation.mjs): its words, its type folder, the folder it runs for, its when in words, its last run */
export type Automation = { id: string; text: string; type: string; for: string; when: string; last: { at: string; ok: boolean; line: string } | null; fails: number; paused_by: "you" | "fails" | null; waits?: string };

/** a block type (sol/design/home/suite/<id>.md, or a folder's blocks/<id>.md written by a run) */
export type Recipe = { id: string; name: string; by: string; tier: "kit" | "suite" | "made"; reads: string; shape: string; run: string; moves: string; example?: string; words: string[]; folder?: string; from?: "suite" | "folder"; path?: string };
export type Form = "line" | "sticky" | "tool" | "block";
export type Tool = "browser" | "write" | "list" | "calendar" | "ask";
/** one Home block: an instance of a recipe; a sticky's is the sticky's own (id, words, folder, state) with the grammar's part beside it */
export type Block2 = {
  id: string; recipe: string; /** null: Home itself (a week or a world no folder holds) */ folder: string | null; words: string; state: string; at: string; sticky?: string;
  body: unknown; form: Form; tool: Tool | null; hand: "its" | "yours";
  own: { name: string; from: string }[]; kept: { name: string }[];
  lifted: null | { to: "stage" | "build"; at: string; ref?: string };
};

export type Home2State = {
  // -- folders (C)
  folders: Folder[];
  context: Record<string, Ctx[]>;
  log: Record<string, LogLine[]>;
  made: Made[];
  /** the automations folder's list across its type folders: each names the folder whose context it runs in */
  automations: Automation[];
  /** archived folders, the top of each archived branch: gone from the side and from filing, nothing deleted */
  archived: { id: string; name: string; crumb: string[] }[];
  // -- the dump and the stickies (B)
  dump: DumpLine[];
  stickies: Sticky[];
  // -- runs (A)
  runs: { host: string; real: boolean; queued: number; running: number };
  // -- the week and ahead (D)
  proposals: Proposal[];
  // -- since you looked (E)
  since: SinceLine[];
  /** the cut: where his previous look ended (null: never looked, everything counts) */
  sinceSeen: string | null;
  /** the phone's up to three lines, the most pressing first */
  sincePhone: string[];
  /** whether his own engine (7777) answered the last Build read */
  sinceBuild: boolean;
  // -- world (G)
  world: { nodes: WorldNode[]; streams: Stream[]; lines: WorldLine[] };
  // -- the suite (#692 suite step 1, suite/grammar.ts): the block types as recipe files, and every block, stickies included
  recipes: Recipe[];
  blocks: Block2[];
};
export type HomeState2 = HomeState & Partial<Home2State>;

// ---- the hook: home.state from the stand-in, plus the cheap messages (home.step, home.made, home.ink) folded in ----
type Wire = { subscribe: (f: (m: any) => void) => () => void; send: (o: object) => boolean | void; up: boolean };
export function useHome2(e: Wire, live = true) {
  const [st, setSt] = useState<HomeState2 | null>(null);
  const waits = useRef(new Map<string, (m: any) => void>());
  const listeners = useRef(new Map<string, Set<(m: any) => void>>());
  const n = useRef(0);
  useEffect(() => live ? e.subscribe((m: any) => {
    if (m.type === "open") { e.send({ type: "home.get" }); return; }
    if (m.rid && waits.current.has(m.rid)) { waits.current.get(m.rid)!(m); waits.current.delete(m.rid); }
    if (m.type === "home.state") { const { type: _t, rid: _r, ...s } = m; setSt(s as HomeState2); }
    else if (m.type === "home.step") setSt((s) => s && ({ ...s, stickies: (s.stickies ?? []).map((x) => x.id === m.sticky ? { ...x, state: x.state === "filed" || x.state === "queued" ? "running" : x.state, steps: [...x.steps, m.step as StepLine] } : x) }));
    else if (m.type === "home.made") setSt((s) => s && ({ ...s, stickies: (s.stickies ?? []).map((x) => x.id === m.sticky ? { ...x, made: [...x.made.filter((y) => y.id !== m.made.id), m.made as Made] } : x) }));
    listeners.current.get(m.type)?.forEach((f) => f(m));
  }) : undefined, [e.subscribe, live]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (live && e.up) e.send({ type: "home.get" }); }, [e.up, live]); // eslint-disable-line react-hooks/exhaustive-deps
  /** a message the face waits on, answered by rid */
  const ask = useCallback(<T,>(o: object): Promise<T> => new Promise((res) => {
    const rid = `home2-${++n.current}`;
    waits.current.set(rid, res);
    e.send({ ...o, rid });
  }), [e.send]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = useCallback((o: object) => e.send(o), [e.send]); // eslint-disable-line react-hooks/exhaustive-deps
  /** listen to one message type (home.ink streams, home.world.say, …); returns the unsubscribe */
  const on = useCallback((type: string, f: (m: any) => void) => {
    const set = listeners.current.get(type) ?? new Set();
    set.add(f); listeners.current.set(type, set);
    return () => { set.delete(f); };
  }, []);
  return { st, ask, send, on, up: e.up };
}
export type Home2Api = ReturnType<typeof useHome2>;

/** where Home2 is: the main view, a folder, world, the automations folder's view across types */
export type Place = { at: "today" } | { at: "folder"; id: string } | { at: "world" };

// ---- the picks still open (#692, the knobs card on the stage): each a key in this window's storage, heard by every
// Home in the window at once, so flipping one on the knobs page changes the Home block with no reload. The first value
// of each is the default (pass2.md's A for the context; jelly.md's bold ones for the jelly).
export const PICKS = {
  /** a folder's context: its first column (A), or a side column at its right edge */
  ctx: ["first", "side"],
  /** while it works on a sticky: a bud on each running or asking sticky, or only the whole creature */
  run: ["bud", "whole"],
  /** the black around the jelly in world: its inside, lit where it rests, or plain */
  back: ["lit", "plain"],
  /** the jelly's skin: today's smooth, or grain and a hard edge */
  skin: ["smooth", "grain"],
} as const;
export type PickKey = keyof typeof PICKS;
export type Picks = { [K in PickKey]: (typeof PICKS)[K][number] };
const PK = (k: PickKey) => `sol.home.pick.${k}`;
const pickSubs = new Set<() => void>();
const readPick = <K extends PickKey>(k: K): Picks[K] => {
  try { const v = localStorage.getItem(PK(k)); if (v && (PICKS[k] as readonly string[]).includes(v)) return v as Picks[K]; } catch { /* private */ }
  return PICKS[k][0] as Picks[K];
};
export function setPick<K extends PickKey>(k: K, v: Picks[K]) { try { localStorage.setItem(PK(k), v); } catch { /* private */ } pickSubs.forEach((f) => f()); }
export const usePick = <K extends PickKey>(k: K): Picks[K] => useSyncExternalStore((f) => { pickSubs.add(f); return () => { pickSubs.delete(f); }; }, () => readPick(k));

// ---- the place of the Home on the stage (sol://home): one per window, in its storage, so the knobs page moves it and
// a Home block opened again comes back where it was. A block whose address names a place (sol://home/world) sets it
// as it opens; changing the place inside writes nothing to the engine.
const PLACE = "sol.home.block.place";
const placeSubs = new Set<() => void>();
let placeRaw = (() => { try { return localStorage.getItem(PLACE) ?? ""; } catch { return ""; } })();
const asPlace = (raw: string): Place => { try { const p = JSON.parse(raw) as Place; return p?.at === "folder" && typeof p.id === "string" ? p : p?.at === "world" ? p : { at: "today" }; } catch { return { at: "today" }; } };
export function setBlockPlace(p: Place) { placeRaw = JSON.stringify(p); try { localStorage.setItem(PLACE, placeRaw); } catch { /* private */ } placeSubs.forEach((f) => f()); }
export const useBlockPlace = (): Place => asPlace(useSyncExternalStore((f) => { placeSubs.add(f); return () => { placeSubs.delete(f); }; }, () => placeRaw));
