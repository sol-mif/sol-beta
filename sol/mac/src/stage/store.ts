// The stage's store (#696): what the face reads and writes of a session's stage, behind one interface, StageStore. The
// engine's six tools (compose, update, bind, freeze, place, read: sitting 1, sol/engine/src/work/tools.ts) are its real
// home; until they are joined, LocalStore keeps the same shapes (block.json, stage.json, the ledger's lines) in this
// window's storage, one key per session. The face never reads a store's insides: a snapshot and a subscription.
// Joined (#709): the face's store is the engine's (engineStore.ts); LocalStore stays for the dev page and the tests.
import type { Block, Line, Place, Rect, StageJson } from "./model";
import type { TrayBlock } from "./trayRules";
import { History } from "./moving.ts";

/** what the stage shows of one session: its blocks, their places, each block's ledger; the tray: the project's open
 *  blocks not on this stage (#739), reachable, not present */
export type Seen = { blocks: Block[]; stage: StageJson; ledger: Record<string, Line[]>; ready?: boolean; tray?: TrayBlock[] };
export const EMPTY: Seen = { blocks: [], stage: { lens: "app", blocks: [], tiled: false }, ledger: {} };

export interface StageStore {
  /** the last known stage of a session (read) */
  read(session: string): Seen;
  /** told each time the session's stage changes */
  subscribe(session: string, f: () => void): () => void;
  /** a block made on this stage, unplaced (the stage finds it a spot) or at a place (compose) */
  compose(session: string, b: Block, at?: Omit<Place, "id">, by?: string): void;
  /** the layout: where each block sits, folded or not, tiled or not (place) */
  place(session: string, stage: StageJson): void;
  /** a block's state or body changed; the line goes in its ledger (update) */
  update(session: string, id: string, patch: Partial<Pick<Block, "state" | "body" | "bind" | "title">>, line?: string, by?: string): void;
  /** a version stamped with your yes (freeze) */
  freeze(session: string, id: string, by: string): void;
  /** closed: off the stage; the ledger keeps it */
  close(session: string, id: string, by: string): void;
  /** what the person points at (a block, a part of it) or picked, so the agent's read names it (#698); empty clears */
  point?(session: string, on: { id: string; part?: string }[]): void;
  /** carried to another session (#700): the same block, one ledger, referenced there too; this stage keeps it */
  carry(session: string, id: string, to: string, by: string): void;
  /** pulled in from the tray (#739): one of the project's blocks carried onto this stage, at the spot it was dropped (none:
   *  the stage finds it one); the same block, one ledger */
  pull(session: string, id: string, by: string, at?: Rect & { hand?: boolean }): void;
  /** a close taken back (⌘Z, #737): live again, at the place it had */
  reopen?(session: string, id: string, at: Omit<Place, "id">, by: string): void;
}

/** each session's stage moves, as far back as the session (⌘Z, #737): kept for this window's life, beside the store */
const histories = new Map<string, History>();
export function historyOf(session: string): History {
  let h = histories.get(session);
  if (!h) { h = new History(); histories.set(session, h); }
  return h;
}

const now = () => Date.now();

/** a store in this window's storage: the shapes the engine will keep, so the swap changes no caller */
export class LocalStore implements StageStore {
  private subs = new Map<string, Set<() => void>>();
  private cache = new Map<string, Seen>();
  private prefix: string;
  private kv: Pick<Storage, "getItem" | "setItem"> | null;
  constructor(prefix = "sol.stage.", kv: Pick<Storage, "getItem" | "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage) {
    this.prefix = prefix; this.kv = kv;
  }

  read(session: string): Seen {
    const c = this.cache.get(session);
    if (c) return c;
    let s: Seen = EMPTY;
    try { const raw = this.kv?.getItem(this.prefix + session); if (raw) s = { ...EMPTY, ...JSON.parse(raw) }; } catch { /* unreadable: an empty stage */ }
    this.cache.set(session, s);
    return s;
  }
  subscribe(session: string, f: () => void) {
    const set = this.subs.get(session) ?? new Set();
    set.add(f); this.subs.set(session, set);
    return () => { set.delete(f); };
  }
  private write(session: string, s: Seen) {
    this.cache.set(session, s);
    try { this.kv?.setItem(this.prefix + session, JSON.stringify(s)); } catch { /* private or full: kept for this window */ }
    this.subs.get(session)?.forEach((f) => f());
  }
  private log(s: Seen, id: string, what: string, by: string): Record<string, Line[]> {
    return { ...s.ledger, [id]: [...(s.ledger[id] ?? []), { at: now(), by, what }] };
  }

  compose(session: string, b: Block, at?: Omit<Place, "id">, by = "sol") {
    const s = this.read(session);
    if (s.blocks.some((x) => x.id === b.id)) return;
    const blocks = [...s.blocks, { ...b, sessions: b.sessions.includes(session) ? b.sessions : [...b.sessions, session] }];
    const stage = at ? { ...s.stage, blocks: [...s.stage.blocks, { id: b.id, ...at }] } : s.stage;
    this.write(session, { blocks, stage, ledger: this.log(s, b.id, "composed", by) });
  }
  place(session: string, stage: StageJson) {
    const s = this.read(session);
    this.write(session, { ...s, stage });
  }
  update(session: string, id: string, patch: Partial<Pick<Block, "state" | "body" | "bind" | "title">>, line?: string, by = "sol") {
    const s = this.read(session);
    const blocks = s.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b));
    this.write(session, { ...s, blocks, ledger: line ? this.log(s, id, line, by) : s.ledger });
  }
  freeze(session: string, id: string, by: string) {
    const s = this.read(session);
    const b = s.blocks.find((x) => x.id === id);
    if (!b) return;
    const n = b.versions.length + 1;
    const blocks = s.blocks.map((x) => (x.id === id ? { ...x, state: "frozen" as const, versions: [...x.versions, { n, at: now(), by }] } : x));
    this.write(session, { ...s, blocks, ledger: this.log(s, id, `frozen as v${n} · your yes`, by) });
  }
  carry(session: string, id: string, to: string, by: string) {
    const s = this.read(session);
    const b = s.blocks.find((x) => x.id === id);
    if (!b || to === session) return;
    const sessions = b.sessions.includes(to) ? b.sessions : [...b.sessions, to];
    const line = { at: now(), by, what: `carried · to ${to}` };
    this.write(session, { ...s, blocks: s.blocks.map((x) => (x.id === id ? { ...x, sessions } : x)), ledger: { ...s.ledger, [id]: [...(s.ledger[id] ?? []), line] } });
    // there: the same block, folded open where the stage finds it a spot
    const t = this.read(to);
    if (t.blocks.some((x) => x.id === id)) return;
    this.write(to, { ...t, blocks: [...t.blocks, { ...b, sessions }], ledger: { ...t.ledger, [id]: [...(s.ledger[id] ?? []), line] } });
  }
  /** the tray here is what a test or the dev page gives (`tray` in the session's Seen); pulled, the block comes onto the
   *  stage from it, at the spot asked */
  pull(session: string, id: string, by: string, at?: Rect & { hand?: boolean }) {
    const s = this.read(session);
    const t = (s.tray ?? []).find((x) => x.id === id);
    if (!t || s.blocks.some((x) => x.id === id)) return;
    const z = Math.max(0, ...s.stage.blocks.map((p) => p.z)) + 1;
    const b: Block = { id, kind: t.kind, title: t.title, state: t.state, versions: [], sessions: [t.from, session] };
    this.write(session, { ...s, blocks: [...s.blocks, b], tray: (s.tray ?? []).filter((x) => x.id !== id),
      stage: at ? { ...s.stage, blocks: [...s.stage.blocks, { id, ...at, z }] } : s.stage, ledger: this.log(s, id, `carried · to ${session}`, by) });
  }
  reopen(session: string, id: string, at: Omit<Place, "id">, by = "you") {
    const s = this.read(session);
    if (!s.blocks.some((b) => b.id === id)) return;
    const blocks = s.blocks.map((b) => (b.id === id ? { ...b, state: "live" as const } : b));
    this.write(session, { blocks, stage: { ...s.stage, blocks: [...s.stage.blocks.filter((p) => p.id !== id), { id, ...at }] }, ledger: this.log(s, id, "back on the stage", by) });
  }
  close(session: string, id: string, by: string) {
    const s = this.read(session);
    const blocks = s.blocks.map((b) => (b.id === id ? { ...b, state: "dead" as const } : b));
    this.write(session, { blocks, stage: { ...s.stage, blocks: s.stage.blocks.filter((p) => p.id !== id) }, ledger: this.log(s, id, "closed", by) });
  }
}
