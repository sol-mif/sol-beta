// The stage's store on the engine (#709, the join of sittings 1 and 2): the StageStore the face uses, over the socket to
// the engine's blocks (sol/engine/src/work/blocks.ts, wire.ts work.stage.*). A session's stage is asked for once
// (work.stage.get) and asked again each time the engine says it changed (work.stage.changed); the person's own presses
// go out as the engine's verbs: the layout (a drag, a fold, tile), a block of their own (compose), a body they changed
// (update), freeze, close. A layout is shown at once and written behind; everything else is shown when the engine says so.
// The shapes in between are the design's §2; what differs on the wire (a body as a file's text, a ledger line's event)
// is read here, by fromEngine and bodyFor, pure so the face's tests reach them.
import type { HandMove } from "../pieces/hands";
import type { Block, Kind, Line, Place, Rect, StageJson, State } from "./model";
import type { TrayBlock } from "./trayRules";
import { EMPTY, type Seen, type StageStore } from "./store.ts";
import { stageSaid } from "../flag.ts";

type Ask = <T = unknown>(type: string, a: object, wait?: number) => Promise<T>;
type Listen = (f: (m: { type?: string; project?: string; line?: unknown; sessionId?: string; block?: { id?: string; state?: string; sessions?: string[]; versions?: unknown[]; scope?: string }; move?: unknown }) => void) => () => void;
/** the socket as a kind that is a program uses it (#699): a terminal's words, a browser's frames */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Link = { ask: Ask; listen: (f: (m: any) => void) => () => void; send: (o: object) => void; frames?: (f: (fr: { tab: string; data: string; w: number; h: number }) => void) => () => void };

/** a body as the engine keeps it: one file's text and its format (a picture by its path); a page bound to an html file
 *  also says where its own files are (`base`, a path on the engine, #744) */
export type WireBody = { format: string; text?: string; file?: string; base?: string };
export type WireLine = { n?: number; at: number; ev: string; by: string; note?: string };
export type WireBlock = Omit<Block, "body" | "bind"> & { bind?: { source: string; watch?: string | false } | null; body?: WireBody; lines?: WireLine[] };
export type WirePlace = Place & { slot?: string; auto?: boolean };
export type WireStage = { lens: StageJson["lens"]; blocks: WirePlace[]; tiled: boolean; start?: StageJson["start"]; talk?: StageJson["talk"] };

const parse = (t?: string): unknown => { try { return JSON.parse(t ?? ""); } catch { return undefined; } };
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** a body as its kind reads it (kinds/types.ts), from the engine's file: json as it is, with the agent's own shapes too
 *  (a list's steps as a bare array, a sheet of shots as one, a table's `columns`); a diff's text; a card's few lines,
 *  the first its big line; a page's html, or its markdown as plain text */
export function bodyFor(kind: Kind, b?: WireBody): unknown {
  if (!b) return undefined;
  if (b.format === "png") return kind === "shots" ? { stills: [{ name: (b.file ?? "").split("/").pop() ?? "", src: b.file }] } : { note: "a picture" };
  const t = b.text ?? "";
  if (b.format === "json") {
    const v = parse(t);
    if (kind === "list") return Array.isArray(v) ? { steps: v } : v;
    if (kind === "shots") return Array.isArray(v) ? { stills: v.map((s) => ({ ...obj(s), src: obj(s).src ?? obj(s).path })) } : v;
    if (kind === "table") { const o = obj(v); return o.cols ? o : { cols: o.columns ?? [], rows: o.rows ?? [] }; }
    return v;
  }
  if (kind === "diff") return { text: t };
  if (kind === "card") { const [big = "", ...rest] = t.split("\n").map((l) => l.replace(/^#+\s*/, "").trim()).filter(Boolean); return { big, sub: rest.join(" · ") || undefined }; }
  if (kind === "page") return b.format === "html" ? { html: t, ...(b.base ? { base: b.base } : {}) } : { text: t };
  return { text: t };
}

/** a ledger line as the frame shows it: what happened, and the note the engine wrote with it */
export const lineOf = (l: WireLine): Line => ({ at: l.at, by: l.by, what: l.note ? `${l.ev} · ${l.note}` : l.ev });

/** a session's stage as the face reads it, from work.stage.get's answer */
export function fromEngine(r: { stage?: WireStage; blocks?: WireBlock[]; tray?: TrayBlock[] }, was?: Kept): Seen {
  const blocks: Block[] = [], ledger: Record<string, Line[]> = {}, sigs = new Map<string, string>();
  for (const w of r.blocks ?? []) {
    // a block the engine sent again unchanged is the same object as before (#866): its frame and its kind do not draw again
    const sig = was ? JSON.stringify(w) : "", old = was && was.sigs.get(w.id) === sig ? was.seen.blocks.find((b) => b.id === w.id) : undefined;
    sigs.set(w.id, sig);
    if (old) { blocks.push(old); ledger[w.id] = was!.seen.ledger[w.id] ?? []; continue; }
    const { body, lines, bind, ...b } = w;
    blocks.push({ ...b, ...(bind?.source ? { bind: { source: bind.source, ...(bind.watch ? { watch: bind.watch } : {}) } } : {}), body: bodyFor(b.kind, body) });
    ledger[b.id] = (lines ?? []).map(lineOf);
  }
  if (was) was.sigs = sigs;
  const s = r.stage ?? EMPTY.stage;
  const stage: StageJson = { lens: s.lens ?? "app", tiled: !!s.tiled, blocks: s.blocks ?? [], ...(s.start ? { start: s.start } : {}), ...(s.talk ? { talk: s.talk } : {}) };
  const tray = Array.isArray(r.tray) ? r.tray : [];
  return { blocks, stage: was && JSON.stringify(stage) === JSON.stringify(was.seen.stage) ? was.seen.stage : stage, ledger, ready: true, tray: was?.seen.tray && JSON.stringify(tray) === JSON.stringify(was.seen.tray) ? was.seen.tray : tray };
}
/** what a stage was the last time the engine answered: the face's reading, and each block as the wire had it */
export type Kept = { seen: Seen; sigs: Map<string, string> };

/** the face's store, once Home (or Work) has handed it the socket: before that every stage is empty and not ready */
export class EngineStore implements StageStore {
  private ask: Ask | null = null;
  private off: (() => void) | null = null;
  private subs = new Map<string, Set<() => void>>();
  private cache = new Map<string, Seen>();
  private asking = new Map<string, number>();
  private again = new Map<string, ReturnType<typeof setTimeout>>();
  private sigs = new Map<string, Map<string, string>>();
  private wire: Link | null = null;
  /** each session's project, as work.stage.get named it: a change in the project refreshes its tray */
  private project = new Map<string, string>();
  /** the socket for a kind that is a program (a terminal, a browser), once Home has handed it in with its send */
  link(): Link | null { return this.wire; }
  /** the engine's ask, when a socket is in (#692 suite: a Home block lifted to Build starts its session with work.start) */
  asker(): Ask | null { return this.ask; }

  /** the socket: Home and Work hand it in (useWork's ask, the engine's messages); called again it is the same link */
  connect(ask: Ask, listen: Listen, more?: { send: (o: object) => unknown; frames?: Link["frames"] }) {
    if (more) this.wire = { ask, listen: listen as Link["listen"], send: (o) => { more.send(o); }, frames: more.frames };
    if (this.ask === ask) return;
    this.off?.();
    this.ask = ask;
    this.off = listen((m) => {
      // the agent's move (#1437): to the space showing its session, or kept until one does
      if (m?.type === "work.stage.hand" && typeof m.sessionId === "string" && m.move && typeof m.move === "object") { this.hand(m.sessionId, m.move as HandMove); return; }
      if (m?.type !== "work.stage.changed") return;
      // the block's state as the change says it, shown at once (a "working" lasts a moment; the next answer may be past it)
      const nb = m.block as (Partial<Block> & { id?: string }) | undefined;
      // #903 (stage.said): the change's own line kept in the ledger at once, in the same showing as the state, so a block
      // closed by the agent is still said as the agent's after it leaves the stage (the next answer no longer carries it)
      const ml = m.line as WireLine | undefined;
      const nl = stageSaid() && ml?.ev && typeof ml.by === "string" ? lineOf(ml) : null;
      if (nb?.id && (nb.state || nl)) for (const [s, seen] of this.cache) {
        if (!seen.blocks.some((b) => b.id === nb.id)) continue;
        const was = seen.ledger[nb.id] ?? [];
        const kept = nl && !was.some((x) => x.at === nl.at && x.what === nl.what && x.by === nl.by) ? { ledger: { ...seen.ledger, [nb.id]: [...was, nl] } } : {};
        if (!nb.state && !("ledger" in kept)) continue;
        this.stale(s, nb.id);
        this.show(s, { ...seen, ...kept, blocks: nb.state ? seen.blocks.map((b) => (b.id === nb.id ? { ...b, state: nb.state as State, ...(nb.versions ? { versions: nb.versions } : {}) } : b)) : seen.blocks });
      }
      // the project's own block (a run's list, #703) is on every session's stage: each one shown asks again
      // the tray (#739): a block made, closed or carried anywhere in the project is in or out of every stage's tray
      for (const s of this.cache.keys()) if ((m.line && m.project && this.project.get(s) === m.project) || m.block?.scope === "project" || m.sessionId === s || m.block?.sessions?.includes(s) || this.cache.get(s)!.blocks.some((b) => b.id === m.block?.id)) this.refetch(s);
    });
    for (const s of this.cache.keys()) this.refetch(s);
  }

  read(session: string): Seen {
    const c = this.cache.get(session);
    if (c) return c;
    const s: Seen = { ...EMPTY, ready: false };
    this.cache.set(session, s);
    this.refetch(session);
    return s;
  }
  subscribe(session: string, f: () => void) {
    const set = this.subs.get(session) ?? new Set();
    set.add(f); this.subs.set(session, set);
    return () => { set.delete(f); };
  }
  private show(session: string, s: Seen) { this.cache.set(session, s); this.subs.get(session)?.forEach((f) => f()); }
  /** asked again, once per burst of changes (a compose is three: the block, its line, its place) */
  private refetch(session: string) {
    if (!this.ask) return;
    clearTimeout(this.again.get(session));
    this.again.set(session, setTimeout(() => { this.again.delete(session); void this.fetch(session); }, 30));
  }
  private async fetch(session: string) {
    const ask = this.ask;
    if (!ask) return;
    const n = (this.asking.get(session) ?? 0) + 1;
    this.asking.set(session, n);
    const r = await ask<{ error?: string; project?: string; stage?: WireStage; blocks?: WireBlock[]; tray?: TrayBlock[] }>("work.stage.get", { sessionId: session });
    if (this.asking.get(session) !== n) return;   // a newer answer is on its way
    if (r.error) { if (!this.cache.get(session)?.ready) this.show(session, { ...EMPTY, ready: true }); return; }
    if (r.project) this.project.set(session, r.project);
    const prev = this.cache.get(session), kept: Kept = { seen: prev ?? EMPTY, sigs: this.sigs.get(session) ?? new Map() };
    const next = fromEngine(r, kept);
    this.sigs.set(session, kept.sigs);
    // the engine's answer is what is shown already (the echo of a drag, a fold, a tile): nothing draws
    if (prev?.ready && next.stage === prev.stage && next.tray === prev.tray && next.blocks.length === prev.blocks.length && next.blocks.every((b, i) => b === prev.blocks[i])) return;
    this.show(session, next);
  }
  /** a block changed here ahead of the engine: its next answer is read afresh */
  private stale(session: string, id: string) { this.sigs.get(session)?.delete(id); }
  private send(type: string, a: object): Promise<void> {
    return this.ask?.(type, a).then((r) => { if ((r as { error?: string })?.error) console.warn(`stage: ${type}: ${(r as { error: string }).error}`); }) ?? Promise.resolve();
  }

  compose(session: string, b: Block, at?: Omit<Place, "id">, _by?: string) {
    const { body, ...rest } = b;
    void this.send("work.stage.compose", { sessionId: session, block: { ...rest, body: JSON.stringify(body ?? null), format: "json", waits: b.state === "waits", ...(b.bind ? { bind: { source: b.bind.source, watch: false } } : {}) }, ...(at ? { at } : {}) });
  }
  place(session: string, stage: StageJson) {
    const s = this.read(session);
    this.show(session, { ...s, stage });
    // an answer asked before this layout would take it back when it lands (#892): it is dropped, and the stage is asked
    // again once the layout is written, so what else that answer carried still arrives
    this.asking.set(session, (this.asking.get(session) ?? 0) + 1);
    void this.send("work.stage.layout", { sessionId: session, stage }).then(() => this.refetch(session));
  }
  update(session: string, id: string, patch: Partial<Pick<Block, "state" | "body" | "bind" | "title">>, line?: string, _by?: string) {
    const s = this.read(session);
    // a state alone (a version shown, a step's look) is the frame's: shown here; a body or a yes is the engine's
    if (patch.body === undefined && patch.state !== "live") {
      if (patch.state) this.stale(session, id);
      if (patch.state) this.show(session, { ...s, blocks: s.blocks.map((b) => (b.id === id ? { ...b, state: patch.state as State } : b)) });
      return;
    }
    if (patch.body === undefined && s.blocks.find((b) => b.id === id)?.state !== "waits") return;
    void this.send("work.stage.update", { sessionId: session, id, ...(patch.body !== undefined ? { body: JSON.stringify(patch.body), format: "json" } : {}), ...(patch.state ? { state: patch.state } : {}), ...(line ? { note: line } : {}) });
  }
  freeze(session: string, id: string, _by: string) { void this.send("work.stage.freeze", { sessionId: session, id }); }
  /** a press (#1298): the engine answers once and says work.stage.changed; the stage is asked again after */
  press(session: string, id: string, choice: string, _by: string) { void this.send("work.stage.press", { sessionId: session, id, choice }).then(() => this.refetch(session)); }
  close(session: string, id: string, _by: string) { void this.send("work.stage.close", { sessionId: session, id }); }
  /** a close taken back (⌘Z, #737): the engine makes it live again where it sat */
  reopen(session: string, id: string, at: Omit<Place, "id">, _by: string) { void this.send("work.stage.reopen", { sessionId: session, id, at }); }
  point(session: string, on: { id: string; part?: string }[]) { void this.send("work.stage.point", { sessionId: session, at: on.length ? on : null }); }
  private hands = new Map<string, Set<(m: HandMove) => void>>();
  private handsLater = new Map<string, HandMove[]>();
  private hand(session: string, m: HandMove) {
    const fs = this.hands.get(session);
    if (fs?.size) { fs.forEach((f) => f(m)); return; }
    const q = this.handsLater.get(session) ?? []; q.push(m); this.handsLater.set(session, q.slice(-8));
  }
  onHand(session: string, f: (m: HandMove) => void) {
    const fs = this.hands.get(session) ?? new Set(); fs.add(f); this.hands.set(session, fs);
    const q = this.handsLater.get(session); if (q) { this.handsLater.delete(session); q.forEach(f); }
    return () => { fs.delete(f); };
  }
  seen(session: string, report: object) { void this.send("work.stage.seen", { sessionId: session, report }); }
  felt(session: string, f: object) { void this.send("work.stage.felt", { ...f, sessionId: session }); }
  /** carried (#700): the engine references the block in the other session too and says so to both stages */
  carry(session: string, id: string, to: string, _by: string) { if (to !== session) void this.send("work.stage.carry", { sessionId: session, id, to }); }
  /** pulled in from the tray (#739): the engine's carry to this very session, at the spot dropped; shown at once out of the
   *  tray and on the stage, the engine's answer after */
  pull(session: string, id: string, _by: string, at?: Rect & { hand?: boolean }) {
    const s = this.read(session), t = (s.tray ?? []).find((x) => x.id === id);
    // already on this stage (a double press, the first one shown at once): nothing more to carry (#892)
    if (s.blocks.some((b) => b.id === id)) return;
    if (t && at) {
      const z = Math.max(0, ...s.stage.blocks.map((p) => p.z)) + 1;
      this.show(session, { ...s, tray: (s.tray ?? []).filter((x) => x.id !== id), blocks: [...s.blocks, { id, kind: t.kind, title: t.title, state: t.state, versions: [], sessions: [t.from, session] }], stage: { ...s.stage, blocks: [...s.stage.blocks, { id, ...at, z }] } });
    }
    this.send("work.stage.carry", { sessionId: session, id, to: session, ...(at ? { at } : {}) });
  }
}

/** the one store the face uses: Home and Work connect it to their socket */
export const store = new EngineStore();
