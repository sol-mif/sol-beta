// The stage's blocks (#695; the design: the stage page §2, the prototype play.html). A block is one thing the agent
// made (a page, a list, stills, a browser, a terminal, a diff, a table, a card). It lives once, in the project's home,
// with a ledger; a session holds references to blocks and a layout for them.
//
//   <home>/<project>/blocks/<id>/block.json    { id, kind, title, bind: { source, watch } | null, state, parent,
//                                                versions: [{ n, at, by }], sessions: [ids], at,
//                                                making?: { file?, command?, machine? } }  (while working, #822)
//   <home>/<project>/blocks/<id>/body/          the thing itself: index.html, index.md, index.json, a png, pty.json, view.json
//   <home>/<project>/blocks/<id>/versions/<n>/  a frozen body, never changed again
//   <home>/<project>/blocks/<id>/ledger.jsonl   one signed line per event, append only
//   <home>/<project>/sessions/<id>/stage.json   { lens, blocks: [{ id, x, y, w, h, z, folded, slot? }], tiled,
//                                                start?: { from?, at, lines },   (a new session's opening, #700)
//                                                talk?: { dock, width?, was? },  (the talk's dock and width, #734)
//                                                left?: [ids],                   (taken off this stage alone, #870)
//                                                room?: { w, h } }               (the stage's real size, #821)
//
// The six verbs (the agent's tools, tools.ts) are compose, update, bind, freeze, place and read; each change goes to
// every Work face as one work.stage.changed (wire.ts gives the bus). A bound source that changes (a file, a URL, a PR,
// a test's or a run's output file) marks the block working, then live, with a ledger line. The home is never committed
// (.gitignore).
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readRun, runBody, runMoves, runState, runWords, whereOf, RUN_POLL_MS, type RunBody } from "./background.js";
import { PANE_KEY } from "./page.js";
import { stageWhole, userLens, setUserLens, LENSES, type Lens } from "../settings.js";
import { hasSystems, systemBodyError } from "./systems.js";   // #1091; a lens naming what the area does not draw is refused (#1220)
import { clockOn, CLOCK_OFF } from "./clock.js";   // #1274
import { localDay } from "../day.js";   // #1298

// system (#1091): an area of the systems registry drawn in five lanes, read live; its body names the area, { "area": "design" }
// systems (#1193): the whole of Jelly, every cluster and the wires between them; a press opens a cluster; its body is {}
// clock (#1177): the person's clock, everything coming in with its ETA (work/clock.ts); its body is {}, the engine feeds it
// session (orchestration step 4, children.ts): a session under an orchestrator, kept current by the engine; { "sessionId": "…" }
export const KINDS = ["page", "list", "shots", "browser", "terminal", "diff", "table", "card", "system", "session", "clock", "systems"] as const;
export type Kind = (typeof KINDS)[number];
export const STATES = ["live", "working", "waits", "frozen", "dead"] as const;
export type State = (typeof STATES)[number];
export const EVENTS = ["composed", "bound", "ran", "waits", "yes", "frozen", "carried", "closed"] as const;
export type Event = (typeof EVENTS)[number];
export const WATCHES = ["file", "url", "pr", "test", "run"] as const;
export type Watch = (typeof WATCHES)[number];
export const SLOTS = ["full", "left", "right", "top", "bottom", "cell"] as const;
export type Slot = (typeof SLOTS)[number];
export { LENSES, type Lens };   // kept in settings.ts, the person's one lens (#824)

export type Bind = { source: string; watch: Watch | false };
export type Version = { n: number; at: number; by: string };
export type Block = {
  id: string; kind: Kind; title: string; bind: Bind | null; state: State; parent: string | null;
  versions: Version[]; sessions: string[]; at: number;
  /** the project's, not one session's (#703): it shows in every session of the project, folded until opened there (a
   *  run's list is; a diff or a terminal stays in its session until carried) */
  scope?: "project";
  /** what the block is being made by, for the making line at its foot (#822, stage.whole on): kept only while it is
   *  working, gone as it settles (saveBlock) */
  making?: Making;
  /** it asks the person (#1298): the press at its foot; waits until answered */
  asks?: Asks;
};
/** the making line's fields (#822): the file being written or the command running, and the machine it happens on. The
 *  names are our pick (no face PR named them yet); this list is their one home, the agent's tools are built from it */
export const MAKING_KEYS = ["file", "command", "machine"] as const;
export type Making = Partial<Record<(typeof MAKING_KEYS)[number], string>>;
/** a making as asked: its three fields when they are words, nothing else; none = undefined (pure) */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cn}\p{Default_Ignorable_Code_Point}]/gu;
export function makingOf(v: unknown): Making | undefined {
  if (!v || typeof v !== "object") return undefined;
  const out: Making = {};
  for (const k of MAKING_KEYS) {
    const x = (v as Record<string, unknown>)[k];
    // one plain line: control, format and invisible characters (newlines, a right-to-left override) become a space
    const t = typeof x === "string" ? x.replace(INVISIBLE, " ").replace(/ {2,}/g, " ").trim() : "";
    if (t) out[k] = t.slice(0, 200);
  }
  return Object.keys(out).length ? out : undefined;
}
export type Line = { n: number; at: number; ev: Event; by: string; block: string; note?: string; prev: string; sig: string };
/** `auto`: the engine picked the spot on its nominal stage (no slot, no place asked); the face lays it out again on its own
 *  width, and its layout drops the mark (stage: joins sitting 2, #709) */
export type Placed = { id: string; x: number; y: number; w: number; h: number; z: number; folded: boolean; slot?: Slot; auto?: boolean;
  /** a ghost (#737, pain point 6): the agent offered it and nobody took it yet; the face draws the frame alone, dashed, its
   *  title in the head, no body. A press or the agent's first body makes it solid (the mark goes). Set in one place,
   *  `ghostly` below; later a judge sets it with a probability, and the mark's shape stays this one boolean */
  ghost?: boolean;
  /** the face's own marks (#701): popped out to a window of its own; folded by a lens; the TUI lens's terminal and where
   *  a borrowed one sat before it went full. Layout only: kept as the face writes them, never a ledger line */
  popped?: boolean; lensed?: boolean; tui?: boolean;
  /** moved or resized by the person's hand (#739): never folded to the tray to make room */
  hand?: boolean; was?: { x: number; y: number; w: number; h: number };
  /** the block's band (#821, stage.whole on): read at the measure, or the stage wide. Set where the engine places it
   *  (bornIn below), kept across the face's layout writes; the face sizes the block by it (sol/mac stage/born.ts) */
  band?: Band };
/** a ledger line as a new session opens on it: which block it is of, by its title */
export type StartLine = Line & { title: string };
/** how a session opened (#700): the session it came from (start_session, hand_off), when, and the project's last ledger
 *  lines, which the face folds under the jelly's first line so nothing is hand-written to hand over */
export type Opening = { from?: string; at: number; lines: StartLine[] };
/** the talk's place on the session's stage (#734, v4 §2): its dock, its width as a share of the room (the seam), and the
 *  dock it left for full (⌘↓ goes back to it). The face draws it; the engine only keeps it. v4: joins grid (step 2, #737)
 *  adds the fifth dock, among the blocks */
export const DOCKS = ["left", "right", "bottom", "full"] as const;
export type Dock = (typeof DOCKS)[number];
export type Talk = { dock: Dock; width?: number; was?: Dock };
export type Stage = { lens: Lens; blocks: Placed[]; tiled: boolean; start?: Opening; talk?: Talk;
  /** the blocks taken off this stage alone (#870 item 5, place's leave): alive, in the tray, and a project's own block
   *  is not brought back by withProject. Absent unless something was left; an id goes as the block is put here again */
  left?: string[];
  /** the stage's real size as the face last wrote it with a layout (#821, stage.whole on); absent until then */
  room?: Room };
export type Format = "html" | "md" | "json" | "text" | "diff";

// ---- where ----
const ENGINE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
/** the home blocks live under: SOL_HOME (read at each call, so a test's own), else the checkout's sol/home */
export const homeRoot = () => process.env.SOL_HOME ?? join(ENGINE_ROOT, "sol", "home");
// the home's own folders: a project of one of these names gets "-project" so its blocks never mix with them
const RESERVED = new Set(["life", "memory", "school", "shelf", "track", "voice", "attachments", "browser-profile", "things", "sessions", "blocks"]);

/** the project a folder belongs to, as a folder name in the home: the repo's own name (a side copy's repo, not the copy) */
export function projectOf(cwd: string): string {
  let dir = resolve(cwd), top: string | null = null;
  for (let d = dir; ; d = dirname(d)) {
    const g = join(d, ".git");
    if (existsSync(g)) {
      top = d;
      // a worktree's .git is a file: "gitdir: <repo>/.git/worktrees/<name>"
      try {
        if (statSync(g).isFile()) {
          const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(g, "utf8"));
          const at = m ? resolve(d, m[1].trim()) : "";
          const i = at.lastIndexOf(`${"/"}.git${"/"}worktrees${"/"}`);
          if (i > 0) top = at.slice(0, i);
        }
      } catch { /* a plain repo */ }
      break;
    }
    if (dirname(d) === d) break;
  }
  return projectName(basename(top ?? dir));
}
/** a folder name safe in the home (pure) */
export function projectName(raw: string): string {
  const s = String(raw || "").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[.-]+|-+$/g, "").slice(0, 60) || "project";
  return RESERVED.has(s) ? `${s}-project` : s;
}
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SID = /^[A-Za-z0-9_-]{1,80}$/;
export const validId = (id: unknown): id is string => typeof id === "string" && ID.test(id);
const projectDir = (p: string) => join(homeRoot(), projectName(p));
const blocksDir = (p: string) => join(projectDir(p), "blocks");
const blockDir = (p: string, id: string) => { if (!validId(id)) throw new Error(`no block "${id}"`); return join(blocksDir(p), id); };
const stageFile = (p: string, sid: string) => { if (!SID.test(sid)) throw new Error("bad session id"); return join(projectDir(p), "sessions", sid, "stage.json"); };
const newId = () => randomBytes(4).toString("hex");

function writeJson(f: string, v: unknown) {
  mkdirSync(dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(v, null, 2) + "\n");
  renameSync(tmp, f);   // never a half-written file
}

// ---- events ----
export type Change = { type: "work.stage.changed"; project: string; block?: Block; stage?: Stage; sessionId?: string; line?: Line };
let bus: ((m: Change) => void) | null = null;
/** who hears every change: wire.ts gives workBus, so every Work face gets work.stage.changed */
export const setStageBus = (f: ((m: Change) => void) | null) => { bus = f; };
const tell = (m: Omit<Change, "type">) => { try { bus?.({ type: "work.stage.changed", ...m }); } catch { /* a face's trouble is never the store's */ } };

// ---- the ledger: one line per event, each signed over the one before it ----
const sign = (prev: string, l: Omit<Line, "sig" | "prev">) => createHash("sha256").update(prev + "\n" + JSON.stringify([l.n, l.at, l.ev, l.by, l.block, l.note ?? ""])).digest("hex").slice(0, 16);

/** a ledger's file as it reads: its whole lines, and whether the file ends in the middle of a line. A line that does not
 *  read (the engine killed mid-append, a full disk) costs that line only, never the lines around it (#898) */
function readLedger(project: string, id: string): { lines: Line[]; torn: boolean } {
  let text = "";
  try { text = readFileSync(join(blockDir(project, id), "ledger.jsonl"), "utf8"); } catch { return { lines: [], torn: false }; }
  const lines: Line[] = [];
  for (const l of text.split("\n")) {
    if (!l) continue;
    try {
      const v = JSON.parse(l);
      if (v && typeof v === "object" && !Array.isArray(v)) lines.push(v as Line);
    } catch { /* a torn line: skipped, and left in the file */ }
  }
  return { lines, torn: text !== "" && !text.endsWith("\n") };
}
export function ledger(project: string, id: string): Line[] { return readLedger(project, id).lines; }
/** whether a ledger is whole: every line signed over the one before it, numbered in order (pure) */
export function ledgerWhole(lines: Line[]): boolean {
  let prev = "";
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.n !== i + 1 || l.prev !== prev || sign(prev, l) !== l.sig) return false;
    prev = l.sig;
  }
  return true;
}
function append(project: string, id: string, ev: Event, by: string, note?: string): Line {
  const { lines: old, torn } = readLedger(project, id);
  const prev = old.length ? old[old.length - 1].sig : "";
  const base = { n: old.length + 1, at: Date.now(), ev, by, block: id, ...(note ? { note: note.slice(0, 300) } : {}) };
  const line: Line = { ...base, prev, sig: sign(prev, base) };
  mkdirSync(blockDir(project, id), { recursive: true });
  // after a torn end the new line starts on a line of its own, or the two would read as one broken line; the torn bytes
  // stay where they are (a ledger is never cut)
  appendFileSync(join(blockDir(project, id), "ledger.jsonl"), (torn ? "\n" : "") + JSON.stringify(line) + "\n");
  return line;
}

// ---- blocks ----
export function getBlock(project: string, id: string): Block | null {
  try { return JSON.parse(readFileSync(join(blockDir(project, id), "block.json"), "utf8")) as Block; } catch { return null; }
}
function must(project: string, id: string): Block {
  const b = getBlock(project, id);
  if (!b) throw new Error(`no block "${id}" in ${projectName(project)}; read lists the stage`);
  return b;
}
const saveBlock = (project: string, b: Block) => {
  if (b.making && b.state !== "working") delete b.making;   // the making line is only for a block being made (#822)
  writeJson(join(blockDir(project, b.id), "block.json"), b);
};
/** every block of a project, newest first; with dead ones only when asked */
export function allBlocks(project: string, dead = false): Block[] {
  let ids: string[] = [];
  try { ids = readdirSync(blocksDir(project)).filter(validId); } catch { return []; }
  return ids.map((id) => getBlock(project, id)).filter((b): b is Block => !!b && (dead || b.state !== "dead")).sort((a, b) => b.at - a.at);
}
/** the projects that have blocks */
export function projects(): string[] {
  try { return readdirSync(homeRoot()).filter((p) => existsSync(join(homeRoot(), p, "blocks"))).sort(); } catch { return []; }
}

// a body: one file under body/, its name by format; a png or a file named by path is copied in
const EXT: Record<Format, string> = { html: "index.html", md: "index.md", json: "index.json", text: "index.txt", diff: "index.diff" };
const DEFAULT_FORMAT: Record<Kind, Format> = { page: "html", list: "json", shots: "json", browser: "json", terminal: "json", diff: "diff", table: "json", card: "md", system: "json", session: "json" , clock: "json", systems: "json" };
/** the format a body is kept in: the one asked for, else the kind's, a page in markdown when it is not html (pure) */
export function formatOf(kind: Kind, body: string, asked?: unknown): Format {
  if (typeof asked === "string" && asked in EXT) return asked as Format;
  if (kind === "page" && body.trim() && !/^\s*</.test(body)) return "md";
  return DEFAULT_FORMAT[kind];
}
function writeBody(project: string, id: string, body: string, format: Format) {
  const dir = join(blockDir(project, id), "body");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, EXT[format]), body);
}
/** a block's body as it stands: its file's name and text (a binary file names itself only) */
export function bodyOf(project: string, id: string, version?: number): { file: string; text?: string } | null {
  const dir = version ? join(blockDir(project, id), "versions", String(version)) : join(blockDir(project, id), "body");
  let f: string | undefined;
  try { f = readdirSync(dir).sort()[0]; } catch { return null; }
  if (!f) return null;
  const abs = join(dir, f);
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(extname(f).toLowerCase())) return { file: abs };
  try { return { file: abs, text: readFileSync(abs, "utf8") }; } catch { return { file: abs }; }
}

// ---- stage.json: a session's layout ----
// the sizes a kind is born at and the stage's margins (play.html SIZES, PAD, GAP); the face lays out by them again on
// its real width, so these place a block sensibly for a stage the engine never sees
export const SIZES: Record<Kind, [number, number]> = { page: [440, 300], list: [340, 232], shots: [460, 300], browser: [480, 340], terminal: [440, 250], diff: [440, 290], table: [400, 230], card: [260, 140], system: [876, 496], session: [340, 232], clock: [876, 420], systems: [876, 496] };
export const STAGE_W = 900, STAGE_H = 520, PAD = 12, GAP = 12;

// ── born at the content's size (#821; whole.md "Engine changes"), only with stage.whole on: no size per kind. A block is
// placed on the stage the face reported (`room`, 900×520 until it has) in its band, one starting height for every kind,
// and marked auto, so the face lays it out at its content's size (sol/mac stage/born.ts) and writes it back with its
// layout. The band is the judge's (#755); until it is in, a rule by kind that is the face's own (born.ts WIDE), so the
// switch changes nothing the person sees until then. Our picks, all here: the name `room` and its limits, the starting
// height. `band` and its two values are the face's (PR #885).
export const BANDS = ["measure", "wide"] as const;
export type Band = (typeof BANDS)[number];
export type Room = { w: number; h: number };
const WIDE: Kind[] = ["terminal", "browser", "shots"];
/** a measure block's width as the face is born: the measure, 412, and its two sides of 12 (born.ts, feel.ts BORN) */
export const MEASURE_W = 412 + 2 * 12;
/** the one height every kind starts at, the face's least block (geometry.ts BLOCK_MIN.h); the face fits it to its content */
export const BORN_H = 120;
const ROOM_MIN = 100, ROOM_MAX = 10_000;
/** the band a kind is born in until the judge gives one (pure) */
export const bandOf = (kind: Kind): Band => (WIDE.includes(kind) ? "wide" : "measure");
/** a room as the face wrote it: two sizes in whole pixels between ROOM_MIN and ROOM_MAX; anything else is none (pure) */
export function roomOf(v: unknown): Room | null {
  const r = v as Partial<Room> | null;
  if (!r || typeof r !== "object") return null;
  const ok = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= ROOM_MIN && n <= ROOM_MAX;
  return ok(r.w) && ok(r.h) ? { w: Math.round(r.w!), h: Math.round(r.h!) } : null;
}
const NOMINAL: Room = { w: STAGE_W, h: STAGE_H };
/** the stage a block is placed on: the room the face reported, with the switch on; else the nominal one */
const roomFor = (s: Stage): Room => (stageWhole() && s.room ? s.room : NOMINAL);
/** a new block's band and size in a room: the measure's width or the room's, never past it; the one starting height */
function bornIn(kind: Kind, room: Room): { band: Band; w: number; h: number } {
  const band = bandOf(kind), inner = { w: room.w - 2 * PAD, h: room.h - 2 * PAD };
  return { band, w: band === "wide" ? inner.w : Math.min(MEASURE_W, inner.w), h: Math.min(BORN_H, inner.h) };
}

const emptyStage = (): Stage => ({ lens: "app", blocks: [], tiled: false });

/** a session's stage as it answers: with stage.whole on, in the person's one lens (the setting, #824), whatever its
 *  stage.json says; off, in its own */
export function getStage(project: string, sid: string): Stage {
  const s = ownStage(project, sid);
  if (stageWhole()) s.lens = userLens();
  return s;
}
/** a session's stage as its stage.json holds it, its own lens and all */
function ownStage(project: string, sid: string): Stage {
  try {
    const v = JSON.parse(readFileSync(stageFile(project, sid), "utf8"));
    return {
      lens: LENSES.includes(v?.lens) ? v.lens : "app", blocks: Array.isArray(v?.blocks) ? v.blocks.filter((p: any) => validId(p?.id)) : [], tiled: v?.tiled === true,
      ...(v?.start && typeof v.start === "object" && Array.isArray(v.start.lines) ? { start: v.start as Opening } : {}),
      ...(talkOf(v?.talk) ? { talk: talkOf(v.talk)! } : {}),
      ...(Array.isArray(v?.left) && v.left.some(validId) ? { left: [...new Set<string>(v.left.filter(validId))] } : {}),
      ...(roomOf(v?.room) ? { room: roomOf(v.room)! } : {}),
    };
  } catch { return emptyStage(); }
}
function saveStage(project: string, sid: string, s: Stage) {
  // left names only what is not on the stage: a block put here again, by any way, is no longer left
  if (s.left) { const here = new Set(s.blocks.map((p) => p.id)), left = s.left.filter((id) => !here.has(id)); if (left.length) s.left = left; else delete s.left; }
  // with stage.whole on the lens is the setting's (#824): stage.json keeps the session's own, so the switch turned off
  // again gives it back
  writeJson(stageFile(project, sid), stageWhole() ? { ...s, lens: ownStage(project, sid).lens } : s);
  tell({ project: projectName(project), sessionId: sid, stage: s });
}
/** a slot's rectangle on the nominal stage, or on the room given (#821) (play.html zoneRect; a cell is the next free grid
 *  cell) (pure) */
export function slotRect(slot: Slot, others: Placed[] = [], room: Room = NOMINAL): { x: number; y: number; w: number; h: number } {
  const W = room.w - 2 * PAD, H = room.h - 2 * PAD, half = (W - GAP) / 2, halfH = (H - GAP) / 2;
  if (slot === "left") return { x: PAD, y: PAD, w: half, h: H };
  if (slot === "right") return { x: PAD + half + GAP, y: PAD, w: half, h: H };
  if (slot === "top") return { x: PAD, y: PAD, w: W, h: halfH };
  if (slot === "bottom") return { x: PAD, y: PAD + halfH + GAP, w: W, h: halfH };
  if (slot === "cell") {
    const cw = (W - 2 * GAP) / 3, ch = halfH;
    for (let i = 0; i < 6; i++) {
      const c = { x: PAD + (i % 3) * (cw + GAP), y: PAD + Math.floor(i / 3) * (ch + GAP), w: cw, h: ch };
      if (!others.some((o) => !o.folded && overlaps(c, o))) return c;
    }
    return { x: PAD, y: PAD, w: cw, h: ch };
  }
  return { x: PAD, y: PAD, w: W, h: H };
}
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w + GAP && b.x < a.x + a.w + GAP && a.y < b.y + b.h + GAP && b.y < a.y + a.h + GAP;
/** where a block of this size goes when no slot is asked: the first free spot, top-left first (play.html free), on the
 *  nominal stage or the room given (#821); none = the stage is full, and it is tiled (pure) */
export function freeSpot(w: number, h: number, others: Placed[], room: Room = NOMINAL): { x: number; y: number } | null {
  const live = others.filter((o) => !o.folded);
  for (let y = PAD; y + h <= room.h - PAD; y += 24) for (let x = PAD; x + w <= room.w - PAD; x += 24) if (!live.some((o) => overlaps({ x, y, w, h }, o))) return { x, y };
  return null;
}
function placeIn(s: Stage, b: Block, slot?: Slot): Placed {
  const others = s.blocks.filter((p) => p.id !== b.id);
  const z = Math.max(0, ...s.blocks.map((p) => p.z)) + 1;
  if (stageWhole()) {   // born at the content's size (#821): in its band, on the room the face reported
    const room = roomFor(s), { band, w, h } = bornIn(b.kind, room);
    if (slot) return { id: b.id, ...slotRect(slot, others, room), z, folded: false, slot, band };
    const at = freeSpot(w, h, others, room);
    if (!at) { s.tiled = true; return { id: b.id, x: PAD, y: PAD, w, h, z, folded: false, auto: true, band }; }
    return { id: b.id, ...at, w, h, z, folded: false, auto: true, band };
  }
  if (slot) return { id: b.id, ...slotRect(slot, others), z, folded: false, slot };
  const [w, h] = SIZES[b.kind];
  const at = freeSpot(w, h, others);
  if (!at) { s.tiled = true; return { id: b.id, x: PAD, y: PAD, w, h, z, folded: false, auto: true }; }   // no room: the stage tiles itself
  return { id: b.id, ...at, w, h, z, folded: false, auto: true };
}
function onStage(project: string, sid: string, b: Block, slot?: Slot, at?: At, ghost = false) {
  const s = getStage(project, sid);
  const old = s.blocks.find((p) => p.id === b.id);
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const p0: Placed = at ? { id: b.id, x: n(at.x, PAD), y: n(at.y, PAD), w: Math.max(40, n(at.w, 300)), h: Math.max(40, n(at.h, 200)), z: n(at.z, Math.max(0, ...s.blocks.map((q) => q.z)) + 1), folded: at.folded === true, ...(at.hand ? { hand: true } : {}) }
    : old && !slot ? { ...old, folded: false } : placeIn(s, b, slot);
  const p = ghost ? { ...p0, ghost: true } : p0;
  s.blocks = [...s.blocks.filter((x) => x.id !== b.id), p];
  saveStage(project, sid, s);
  return p;
}

// ---- the press (#1298): any block may ask the person something; the press at its foot is the one constant ----
// The agent makes the block the ask needs (a card, a table, a diff, stills) and names the question and its choices; the
// person's press is answered once, in place, and goes back to whoever asked (work/asks.ts routes it).
export const ASK_CHOICES = ["yes", "no", "later"] as const;
/** what the press answers: a block of this session's own agent (self), a hand-over or an offer from a teammate's agent
 *  (hand, offer: the reply travels back by the relay), a late answer to an ask of mine (answer); a wait the morning
 *  brought (#1128): an issue or a PR waiting on me (issue, its id "<review|decision>-<n>"), an ask to me (ask) */
export const REFS = ["self", "hand", "offer", "answer", "issue", "ask"] as const;
export type Ref = { kind: (typeof REFS)[number]; id: string };
export type Pressed = { choice: string; by: string; at: number };
export type Asks = {
  /** the question, in a few words */ q: string;
  choices: string[];
  /** the session that composed it: a self press comes back there as a turn */ by: string;
  /** a teammate's agent asking (hand, offer); the login is the hub's word */ from?: { login: string; agent: boolean };
  /** the issue it is about */ about?: number;
  ref: Ref;
  /** pressed later, on this day (YYYY-MM-DD, local): it stays on top of the Room and comes back on a later day's first
   *  session, which marks it again with that day */ later?: string;
  answer?: Pressed;
};
export type AsksArgs = { q?: unknown; choices?: unknown; from?: unknown; about?: unknown; ref?: unknown };
const askWords = (v: unknown, max: number) => (typeof v === "string" ? v.replace(INVISIBLE, "").replace(/\s+/g, " ").trim().slice(0, max) : "");
/** an ask as kept, or why not (pure). `by` the composing session, `id` the block's (a self ref names it) */
export function asksOf(a: AsksArgs, by: string, id: string): Asks | string {
  const q = askWords(a?.q, 140);
  if (!q) return "asks needs q: the question in a few words";
  const raw = a.choices === undefined ? [...ASK_CHOICES] : Array.isArray(a.choices) ? a.choices : null;
  const choices = raw ? [...new Set(raw.map((c) => askWords(c, 24)).filter(Boolean))] : [];
  if (choices.length < 2 || choices.length > 4) return "asks.choices: two to four short words (yes · no · later when left out)";
  const r = a.ref as Partial<Ref> | undefined;
  const ref: Ref = r && REFS.includes(r.kind as Ref["kind"]) && typeof r.id === "string" && /^[A-Za-z0-9-]{1,64}$/.test(r.id) ? { kind: r.kind as Ref["kind"], id: r.id } : { kind: "self", id };
  const f = a.from as { login?: unknown; agent?: unknown } | undefined;
  const from = f && typeof f.login === "string" && /^[A-Za-z0-9-]{1,39}$/.test(f.login) ? { login: f.login, agent: f.agent !== false } : undefined;
  const n = typeof a.about === "number" ? a.about : typeof a.about === "string" && /^#?\d{1,7}$/.test(a.about.trim()) ? Number(a.about.trim().replace("#", "")) : 0;
  return { q, choices, by, ...(from ? { from } : {}), ...(Number.isInteger(n) && n > 0 && n < 1e7 ? { about: n } : {}), ref };
}
/** a block that waits on a press: it asks and nobody answered yet (pure) */
export const asking = (b: Pick<Block, "asks" | "state">) => !!b.asks && !b.asks.answer && b.state !== "dead";

// ---- the six verbs ----
export type Who = { project: string; sessionId: string; by: string; cwd?: string };
/** `at`: a place the face asked (the person's own compose: a chip dropped, the fixture), kept as it is */
export type At = { x: number; y: number; w: number; h: number; z?: number; folded?: boolean; hand?: boolean };
export type ComposeArgs = { kind: Kind; title?: string; body?: string; slot?: Slot; format?: Format; parent?: string; waits?: boolean; id?: string; bind?: { source: string; watch?: unknown }; at?: At;
  /** the person's own compose (the face's: a chip dropped, the fixture), never the agent's */
  person?: boolean;
  /** the making line (#822, stage.whole on), kept while the block works */
  making?: Making;
  /** the project's from the start (#1166: the Agents' room), in every session of it */
  scope?: "project";
  /** it asks the person (#1298): the press at its foot; it waits until answered */
  asks?: AsksArgs };

// ── ghosts (#737, pain point 6): the one place a block is born a ghost. The agent's compose lands as one unless it waits on
// the person (the block forward with its press inside), the person dropped its chip (`at`), or the person asked for that
// kind by name in their last ask ("show me X": the ask is the press). The person's own compose is never one.
const named = new Map<string, Kind[]>();
const ASKING = /^\s*(please\s+)?(show( me)?|open|put|give me|make|draw|get|run|stills?\s+of|screenshots?\s+of|an?\s+(diff|table|list|page|card)\s+of)\b/i;
/** a sent ask (runs.ts): the kinds the person named in it, kept for the agent's compose calls of this turn; an ask that
 *  names nothing clears them */
export function asked(sid: string, text: string, things?: { kind?: unknown }[]) {
  const kinds = ASKING.test(text) ? (things ?? []).map((t) => t?.kind).filter((k): k is Kind => KINDS.includes(k as Kind)) : [];
  if (kinds.length) named.set(sid, kinds); else named.delete(sid);
}
/** whether this compose lands as a ghost; a kind the person named is taken off the list as it lands (pure but for it).
 *  `take: false` only looks: the list is left as it was (the frame's question, asked before the block is written) */
export function ghostly(sid: string, a: Pick<ComposeArgs, "kind" | "waits" | "at" | "person">, take = true): boolean {
  if (a.person || a.waits || a.at) return false;
  const k = named.get(sid), i = k ? k.indexOf(a.kind) : -1;
  if (i < 0) return true;
  if (take) k!.splice(i, 1);
  return false;
}
/** the ghost taken: by the agent's first body (update), or a press on the face (its layout drops the mark) */
function solid(project: string, id: string, sessions: string[]) {
  for (const sid of sessions) {
    const s = getStage(project, sid);
    if (!s.blocks.some((p) => p.id === id && p.ghost)) continue;
    s.blocks = s.blocks.map((p) => { if (p.id !== id) return p; const { ghost: _g, ...q } = p; return q; });
    saveStage(project, sid, s);
  }
}

// the blocks the agent is still making (#822, stage.whole on): composed as a frame, or updated with more; no settle ends
// them until an update without more comes. In memory: an engine that restarts leaves such a block working
const held = new Set<string>();
const heldKey = (project: string, id: string) => `${project}\n${id}`;

export function compose(w: Who, a: ComposeArgs): Block {
  if (!KINDS.includes(a.kind)) throw new Error(`kind is one of ${KINDS.join(", ")}`);
  if (a.kind === "clock" && !clockOn()) throw new Error(CLOCK_OFF);   // #1274
  if ((a.kind === "system" || a.kind === "systems") && !hasSystems()) throw new Error("a system block needs the systems registry (sol/systems/records), which this checkout has not");
  if (a.slot !== undefined && !SLOTS.includes(a.slot)) throw new Error(`slot is one of ${SLOTS.join(", ")}`);
  if (a.parent !== undefined && !getBlock(w.project, a.parent)) throw new Error(`no parent block "${a.parent}"`);
  const id = a.id && validId(a.id) ? a.id : newId();
  if (getBlock(w.project, id)) throw new Error(`a block "${id}" is there already`);
  const asks = a.asks ? asksOf(a.asks, w.sessionId, id) : undefined;
  if (typeof asks === "string") throw new Error(asks);
  if (asks) a = { ...a, waits: true };   // a block that asks waits on the press
  const body = String(a.body ?? "");
  if (a.kind === "system" && body) { const e = systemBodyError(body); if (e) throw new Error(e); }
  // the frame first (#822, stage.whole on): the agent's compose with no body opens the frame at once, working until its
  // last update; a ghost stays a ghost, the person's own compose is never left open, and a bound block's source fills it.
  // Ghostly only looks here: the named kind is taken where it always was, once the block is written and told
  const frame = !body && !a.waits && !a.person && !a.bind && stageWhole() && !ghostly(w.sessionId, a, false);
  const making = frame ? makingOf(a.making) : undefined;
  const b: Block = {
    id, kind: a.kind, title: String(a.title ?? "").trim().slice(0, 80) || a.kind, bind: null, state: a.waits ? "waits" : frame ? "working" : "live",
    parent: a.parent ?? null, versions: [], sessions: [w.sessionId], at: Date.now(), ...(making ? { making } : {}), ...(a.scope === "project" ? { scope: "project" as const } : {}),
    ...(asks ? { asks } : {}),
  };
  writeBody(w.project, id, body, formatOf(a.kind, body, a.format));
  saveBlock(w.project, b);
  if (frame) held.add(heldKey(w.project, id));
  const line = append(w.project, id, "composed", w.by, `${a.kind} "${b.title}"`);
  tell({ project: projectName(w.project), sessionId: w.sessionId, block: b, line });
  onStage(w.project, w.sessionId, b, a.kind === "clock" ? "full" : a.slot, a.at, ghostly(w.sessionId, a));   // a clock is always full width (#1177)
  if (a.waits) waitsOn(w, b);
  return a.bind ? bind(w, { id, source: a.bind.source, watch: a.bind.watch }) : b;
}
function waitsOn(w: Who, b: Block) {
  const line = append(w.project, b.id, "waits", w.by, "waits on your word");
  tell({ project: projectName(w.project), sessionId: w.sessionId, block: b, line });
}

export function update(w: Who, a: { id: string; body?: string; format?: Format; title?: string; waits?: boolean;
  /** more follows (#822, stage.whole on): the block stays working, no settle */
  more?: boolean;
  /** the making line (#822, stage.whole on): replaces the one before while the block works */
  making?: Making;
  /** it asks now (#1298): a new question, any answer before it cleared */
  asks?: AsksArgs }): Block {
  const b = must(w.project, a.id);
  if (b.state === "dead") throw new Error(`"${b.title}" is closed`);
  if (a.asks) {
    const asks = asksOf(a.asks, w.sessionId, b.id);
    if (typeof asks === "string") throw new Error(asks);
    b.asks = asks;
  }
  if (asking(b)) a = { ...a, waits: true };   // a block that asks waits until it is pressed, whatever else changes
  if (b.kind === "system" && a.body) { const e = systemBodyError(String(a.body)); if (e) throw new Error(e); }
  if (a.body !== undefined) writeBody(w.project, b.id, String(a.body), formatOf(b.kind, String(a.body), a.format));
  if (typeof a.title === "string" && a.title.trim()) b.title = a.title.trim().slice(0, 80);
  // a frozen block refined is live again: its versions stay as they were, what changes now is the next one. A body that
  // changes is working for a moment first, as a watched source's change is (the frame's rim drifts, the jelly travels to
  // it: #709), then live; with stage.whole on, working as long as more follows (#822)
  const whole = stageWhole(), more = whole && a.more === true && !a.waits;
  const working = (a.body !== undefined || more) && !a.waits;
  b.state = a.waits ? "waits" : working ? "working" : "live";
  if (more) held.add(heldKey(w.project, b.id)); else held.delete(heldKey(w.project, b.id));
  const making = whole ? makingOf(a.making) : undefined;
  if (making) b.making = making;
  saveBlock(w.project, b);
  if (a.body !== undefined || a.waits) solid(w.project, b.id, b.sessions);   // a ghost's first body (or its ask) makes it solid
  const line = append(w.project, b.id, a.waits ? "waits" : "ran", w.by, a.waits ? "waits on your word" : a.body !== undefined ? "the body changed" : "changed");
  tell({ project: projectName(w.project), sessionId: w.sessionId, block: b, line });
  if (working && !more) setTimeout(() => {
    const now = getBlock(w.project, b.id);
    if (!now || now.state !== "working" || held.has(heldKey(w.project, b.id))) return;   // more came since: not done yet
    now.state = "live";
    saveBlock(w.project, now);
    tell({ project: projectName(w.project), sessionId: w.sessionId, block: now });
  }, SETTLE_MS).unref?.();
  return b;
}

/** what a source is watched as, when bind is not told: a URL, a PR (#123 or a pull link), else a file (pure) */
export function watchOf(source: string, asked?: unknown): Watch | false {
  if (asked === false || asked === "none") return false;
  if (typeof asked === "string" && (WATCHES as readonly string[]).includes(asked)) return asked as Watch;
  if (/^#?\d+$/.test(source) || /\/pull\/\d+/.test(source)) return "pr";
  if (/^https?:\/\//.test(source)) return "url";
  return "file";
}
export function bind(w: Who, a: { id: string; source: string; watch?: unknown }): Block {
  const b = must(w.project, a.id);
  const raw = String(a.source ?? "").trim();
  if (!raw) throw new Error("bind needs a source: a file, a URL, a PR, a test or a run's output");
  const watchAs = watchOf(raw, a.watch);
  // a file is kept by its whole path, so the watch finds it whichever session asks
  const source = (watchAs === "file" || watchAs === "test" || watchAs === "run") && !isAbsolute(raw) && !/^https?:\/\//.test(raw) ? resolve(w.cwd ?? process.cwd(), raw.replace(/^~(?=\/|$)/, process.env.HOME ?? "~")) : raw;
  b.bind = { source, watch: watchAs };
  if (b.state !== "dead" && b.state !== "waits") b.state = "live";
  if (isRun(b)) b.scope = "project";   // what runs in the background is the project's, in every session (#703)
  saveBlock(w.project, b);
  pull(w.project, b);
  const line = append(w.project, b.id, "bound", w.by, `${watchAs || "kept"} ${source}`);
  tell({ project: projectName(w.project), sessionId: w.sessionId, block: b, line });
  arm(w.project, b);
  return b;
}

export function freeze(w: Who, a: { id: string }): Block {
  const b = must(w.project, a.id);
  if (b.state === "dead") throw new Error(`"${b.title}" is closed`);
  const n = b.versions.length + 1;
  const to = join(blockDir(w.project, b.id), "versions", String(n));
  mkdirSync(dirname(to), { recursive: true });
  if (existsSync(join(blockDir(w.project, b.id), "body"))) cpSync(join(blockDir(w.project, b.id), "body"), to, { recursive: true });
  else mkdirSync(to, { recursive: true });
  b.versions.push({ n, at: Date.now(), by: w.by });
  b.state = "frozen";
  saveBlock(w.project, b);
  const line = append(w.project, b.id, "frozen", w.by, `v${n}`);
  tell({ project: projectName(w.project), sessionId: w.sessionId, block: b, line });
  return b;
}

/** the person's word on a block that waits (the face's yes): live again, and a ledger line that says so */
export function yes(w: Who, a: { id: string; note?: string }): Block {
  const b = must(w.project, a.id);
  if (b.state === "waits") b.state = "live";
  saveBlock(w.project, b);
  const line = append(w.project, b.id, "yes", w.by, a.note ?? "your yes");
  tell({ project: projectName(w.project), sessionId: w.sessionId, block: b, line });
  return b;
}

/** the person's press on a block that asks (#1298), keyed by the block: the first answer is kept with a ledger line; a
 *  press after it returns that first answer and changes nothing (`first` false). `later` is not an answer: the block
 *  stays waiting, marked later, and may still be answered */
export function press(w: Who, a: { id: string; choice: string }): { block: Block; answer?: Pressed; first: boolean; later?: boolean } {
  const b = must(w.project, a.id);
  if (!b.asks) throw new Error(`"${b.title}" asks nothing`);
  if (b.asks.answer) return { block: b, answer: b.asks.answer, first: false };
  if (b.state === "dead") throw new Error(`"${b.title}" is closed`);
  const choice = askWords(a.choice, 24);
  if (!b.asks.choices.includes(choice)) throw new Error(`the choices are ${b.asks.choices.join(" · ")}`);
  const by = w.by.split(" · ")[0].replace(/'s agent$/, "");
  if (choice === "later" && !b.asks.later) {
    b.asks = { ...b.asks, later: localDay(Date.now()) };
    saveBlock(w.project, b);
    const line = append(w.project, b.id, "waits", by, "later");
    tell({ project: projectName(w.project), sessionId: w.sessionId, block: b, line });
    return { block: b, first: true, later: true };
  }
  if (choice === "later") return { block: b, first: false, later: true };
  const answer: Pressed = { choice, by, at: Date.now() };
  const { later: _l, ...rest } = b.asks;
  b.asks = { ...rest, answer };
  b.state = "live";
  saveBlock(w.project, b);
  const line = append(w.project, b.id, "yes", by, `${choice}: ${b.asks.q}`);
  tell({ project: projectName(w.project), sessionId: w.sessionId, block: b, line });
  return { block: b, answer, first: true };
}

/** a later brought back to a session (#1298): marked with the day it came back, so it comes once a day at most */
export function laterBack(project: string, id: string, day: string): void {
  const b = getBlock(project, id);
  if (!b?.asks?.later || b.asks.answer) return;
  b.asks = { ...b.asks, later: day };
  saveBlock(project, b);
}

export type PlaceArgs = { id: string; slot?: Slot; fold?: boolean; carry?: string; close?: boolean;
  /** where a carried block lands (a tray's miniature dropped on the stage, #739) */
  at?: At;
  /** off this session's stage alone (#870 item 5): the block stays alive, in its sessions' list and on their stages, and
   *  waits in this one's tray. A layout change, like a fold: no ledger line */
  leave?: boolean;
  /** with carry: the carry is a move, off the asking session's stage as it lands on the other (#826). Only the person's
   *  drag sets it (carryByHand); the agent's carry and start()'s stay copies */
  move?: boolean;
  /** the making line (#822, stage.whole on), taken only by a block that is working */
  making?: Making };
/** a block off one session's stage, and kept off it (left): its block.json is not touched */
function leaveStage(project: string, sid: string, id: string) {
  const s = getStage(project, sid);
  s.blocks = s.blocks.filter((p) => p.id !== id);
  s.left = [...(s.left ?? []).filter((x) => x !== id), id];
  saveStage(project, sid, s);
}
export function place(w: Who, a: PlaceArgs): { block: Block; placed?: Placed; to?: string } {
  const b = must(w.project, a.id);
  if (a.slot !== undefined && !SLOTS.includes(a.slot)) throw new Error(`slot is one of ${SLOTS.join(", ")}`);
  const making = b.state === "working" && stageWhole() ? makingOf(a.making) : undefined;
  // the making line is written only once the rest of the call holds: a refused place changes nothing
  if (making && a.carry !== undefined && !a.close && !a.leave && !SID.test(String(a.carry))) throw new Error("carry names a session id");
  if (making && !a.close) { b.making = making; saveBlock(w.project, b); tell({ project: projectName(w.project), sessionId: w.sessionId, block: b }); }
  if (a.close) {
    b.state = "dead";
    saveBlock(w.project, b);
    held.delete(heldKey(w.project, b.id));
    disarm(b.id);
    for (const f of closers) { try { f(w.project, b); } catch { /* a program's end is never the close's trouble */ } }
    const line = append(w.project, b.id, "closed", w.by);
    for (const sid of b.sessions) { const s = getStage(w.project, sid); if (s.blocks.some((p) => p.id === b.id)) { s.blocks = s.blocks.filter((p) => p.id !== b.id); saveStage(w.project, sid, s); } }
    tell({ project: projectName(w.project), sessionId: w.sessionId, block: b, line });
    return { block: b };
  }
  if (a.leave) {
    leaveStage(w.project, w.sessionId, b.id);
    return { block: b };
  }
  if (b.state === "dead") throw new Error(`"${b.title}" is closed`);
  if (a.carry !== undefined) {
    // carried: the same block in another session too, one ledger; no copy is made
    const to = String(a.carry);
    if (!SID.test(to)) throw new Error("carry names a session id");
    if (!b.sessions.includes(to)) b.sessions.push(to);
    saveBlock(w.project, b);
    const placed = onStage(w.project, to, b, a.slot, a.at);
    if (a.move && to !== w.sessionId) leaveStage(w.project, w.sessionId, b.id);
    const line = append(w.project, b.id, "carried", w.by, `to ${to}`);
    tell({ project: projectName(w.project), sessionId: to, block: b, line });
    return { block: b, placed, to };
  }
  if (!b.sessions.includes(w.sessionId)) { b.sessions.push(w.sessionId); saveBlock(w.project, b); }
  let placed = onStage(w.project, w.sessionId, b, a.slot);
  if (a.fold !== undefined) {
    const s = getStage(w.project, w.sessionId);
    s.blocks = s.blocks.map((p) => (p.id === b.id ? { ...p, folded: a.fold ?? p.folded } : p));
    placed = s.blocks.find((p) => p.id === b.id)!;
    saveStage(w.project, w.sessionId, s);
  }
  return { block: b, placed };
}

/** the person's carry from the face (work.stage.carry): a tray's miniature pulled onto this stage (to is the asking
 *  session), or a block dropped on another session's row. With the engine's switch stage.whole on, the drop is a move
 *  (#826: gone here, waiting there); off, it is today's copy */
export function carryByHand(w: Who, a: { id: string; to: string; at?: At }): Block {
  return place(w, { id: a.id, carry: a.to, ...(a.at ? { at: a.at } : {}), ...(stageWhole() && a.to !== w.sessionId ? { move: true } : {}) }).block;
}

/** a close taken back (#737, ⌘Z on the face): the block is live again, back on this session's stage where it sat; its
 *  ledger says so. A terminal's program does not come back with it (its pty went with the close) */
export function reopen(w: Who, a: { id: string; at?: At }): Block {
  const b = must(w.project, a.id);
  if (b.state === "dead") { b.state = "live"; saveBlock(w.project, b); }
  if (!b.sessions.includes(w.sessionId)) { b.sessions.push(w.sessionId); saveBlock(w.project, b); }
  const line = append(w.project, b.id, "ran", w.by, "back on the stage");
  tell({ project: projectName(w.project), sessionId: w.sessionId, block: b, line });
  onStage(w.project, w.sessionId, b, undefined, a.at);
  if (b.bind?.watch) arm(w.project, b);
  return b;
}

// ---- the kinds that are programs (#699, live.ts): a terminal's pty and a browser's tab live in the engine, beside the
// block; these are the few doors live.ts needs into the store ----
const closers: ((project: string, b: Block) => void)[] = [];
/** told when a block closes: a terminal's pty is killed, a browser's tab closed (live.ts) */
export const onClose = (f: (project: string, b: Block) => void) => { closers.push(f); };
/** a block's own folder, for what lives beside its body (a stills block's pictures, kept across body writes) */
export const blockPath = (project: string, id: string) => blockDir(project, id);
/** a body written quietly: no state change, no ledger line (a browser block's address as the page moves, its wheel's
 *  hand); the face is told, as for any change */
export function setBody(project: string, id: string, body: string, format: Format = "json"): Block {
  const b = must(project, id);
  if (b.state === "dead") throw new Error(`"${b.title}" is closed`);
  writeBody(project, id, body, format);
  tell({ project: projectName(project), block: b });
  return b;
}
/** a block's name set quietly (a session block's tab follows its session's title, children.ts): no ledger line */
export function retitle(project: string, id: string, title: string): Block {
  const b = must(project, id);
  const t = title.trim().slice(0, 80);
  if (t && t !== b.title) { b.title = t; saveBlock(project, b); tell({ project: projectName(project), block: b }); }
  return b;
}
/** one ledger line on a block with no change of its body or state (the wheel changed hands, the shell ended) */
export function remark(project: string, id: string, by: string, note: string, ev: Event = "ran"): Line | null {
  const b = getBlock(project, id);
  if (!b) return null;
  const line = append(project, id, ev, by, note);
  tell({ project: projectName(project), block: b, line });
  return line;
}

// ---- start: a session opens on what the project has open (#700) ----
/** whether a session has a stage of its own yet (a stage.json written) */
export const hasStage = (project: string, sid: string) => { try { return existsSync(stageFile(project, sid)); } catch { return false; } };
/** how many of the project's last ledger lines a new session opens with */
export const START_LINES = 6;
/** a block a new session opens on: open (not closed), and not only a frozen version (pure) */
export const opensOn = (b: Block) => b.state !== "dead" && b.state !== "frozen";

/** a session's start (#700, #739). The first time (no stage.json yet): its stage opens with the talk alone. A block
 *  belongs to the session that made it; the project's other blocks are reachable from the tray (trayOf), never put on a
 *  new stage. The project's last ledger lines are kept as `start`, so nothing is hand-written to hand over. Then the
 *  blocks named in `carry` (start_session's and hand_off's `blocks`, the old session's list) are carried to it, unfolded,
 *  a "carried" line each, signed by `w.by`. A session that has a stage already is never laid out again: coming back opens
 *  exactly what was left. */
export function start(w: Who, a: { from?: string; carry?: string[] } = {}): Stage {
  if (!hasStage(w.project, w.sessionId)) {
    const open = allBlocks(w.project).filter(opensOn);
    const s = emptyStage();
    const lines = open.flatMap((b) => ledger(w.project, b.id).map((l) => ({ ...l, title: b.title }))).sort((x, y) => x.at - y.at || x.n - y.n).slice(-START_LINES);
    s.start = { ...(a.from && SID.test(a.from) ? { from: a.from } : {}), at: Date.now(), lines };
    saveStage(w.project, w.sessionId, s);
  }
  for (const id of new Set(a.carry ?? [])) {
    const b = validId(id) ? getBlock(w.project, id) : null;
    if (!b || b.state === "dead") continue;
    const placed = getStage(w.project, w.sessionId).blocks.find((p) => p.id === id);
    if (placed && !placed.folded && b.sessions.includes(w.sessionId)) continue;   // there already, unfolded
    place({ ...w, sessionId: a.from && SID.test(a.from) ? a.from : w.sessionId }, { id, carry: w.sessionId });
  }
  return getStage(w.project, w.sessionId);
}

/** one of the project's blocks in a session's tray (#739): reachable, not present. `from` is the session that made it */
export type Trayed = { id: string; kind: Kind; title: string; state: State; from: string; at: number };
/** the tray: the project's open blocks that are not on this session's stage, newest first, each with the session that
 *  made it (the face groups by it). The stage's own folded blocks are the face's to add (they are on the stage) */
export function trayOf(project: string, sid: string, stage = getStage(project, sid)): Trayed[] {
  const here = new Set(stage.blocks.map((p) => p.id));
  return allBlocks(project).filter((b) => opensOn(b) && !here.has(b.id))
    .map((b) => ({ id: b.id, kind: b.kind, title: b.title, state: b.state, from: b.sessions[0] ?? "", at: b.at }));
}

// what the person points at, per session (the face says it on hover: work.stage.point; a sent ask says it again): one
// block or a part of it (any element with data-part), or the blocks they picked (⇧click, a marquee). read names it (#698)
export type Target = { id: string; part?: string };
const pointing = new Map<string, Target[]>();
export function point(sid: string, at: Target | Target[] | null) {
  const all = (Array.isArray(at) ? at : at ? [at] : []).filter((t) => t && validId(t.id)).slice(0, 12)
    .map((t) => ({ id: t.id, ...(t.part ? { part: String(t.part).slice(0, 80) } : {}) }));
  if (all.length) pointing.set(sid, all); else pointing.delete(sid);
}
/** a target as words: the block's title, then the part (the week › Thu › 14:00) */
export function targetWords(project: string, t: Target): string | null {
  const b = getBlock(project, t.id);
  return b ? `${b.title}${t.part ? ` › ${t.part}` : ""}` : null;
}

/** the stage as a short list, the agent's eyes on it: title, kind, state, slot, and what the person points at */
export function read(w: Who, seen?: (id: string) => string | undefined): string {
  const s = withProject(w.project, w.sessionId);
  const lines = s.blocks.map((p) => {
    const b = getBlock(w.project, p.id);
    if (!b || b.state === "dead") return "";
    // what the person's window drew, when it reports (#1435, eyes.ts); else the engine's own place for it
    const where = (!p.folded ? seen?.(p.id) : undefined) ?? (p.folded ? "folded" : p.slot ?? `at ${Math.round(p.x)},${Math.round(p.y)} ${Math.round(p.w)}×${Math.round(p.h)}`);
    const v = b.versions.length ? ` v${b.versions.length}` : "";
    const run = isRun(b) ? runOf(w.project, b.id) : null;   // a run's list says its sessions (#703)
    const runs = run ? ` · ${run.where}: ${runWords(run)}${run.steps.filter((x) => x.run.state === "waits").map((x) => ` · ${x.run.name} needs the person: ${x.run.said}`).join("")}` : "";
    return `${b.id} · ${b.title} · ${b.kind} · ${b.state}${v} · ${where}${b.bind ? ` · bound to ${b.bind.source}` : ""}${runs}`;
  }).filter(Boolean);
  const on = (pointing.get(w.sessionId) ?? []).map((t) => { const words = targetWords(w.project, t); return words ? `${words} (${t.id})` : ""; }).filter(Boolean);
  const waits = s.blocks.map((p) => getBlock(w.project, p.id)).filter((b) => b?.state === "waits").map((b) => b!.title);
  return [
    lines.length ? `The stage (${s.lens}${s.tiled ? ", tiled" : ""}), ${lines.length} block${lines.length > 1 ? "s" : ""}:` : "The stage is empty.",
    ...lines,
    ...(on.length === 1 ? [`The person points at: ${on[0]}`] : on.length ? [`The person picked ${on.length}: ${on.join(" · ")}`] : []),
    ...(waits.length ? [`Waiting on the person: ${waits.join(", ")}`] : []),
  ].join("\n");
}

// ── the ask's stage (#698): what a sent ask carries beside its words. `on`: what the person pointed at or picked as they
// said it, so "this" and "both" resolve; `things`: the bar's chips, the ask split into parts with a kind each and the
// slot a dropped chip or the words gave it, hints for the agent's compose calls (it may merge or add). The agent reads
// them as one paragraph under the words, after ASK; the transcript read again splits it off (splitAsk), so the person's
// line shows only their words, with the target as a chip.
export type Thing = { kind: Kind; title: string; slot?: Slot | At | null };
export type AskStage = { things?: Thing[]; on?: Target[] };
export const ASK = "[the stage]";
const ON = "on: ", SEP = " | ";
const where = (s: Thing["slot"]) => (!s ? "" : typeof s === "string" ? `, slot ${s}` : `, at {x:${Math.round(s.x)},y:${Math.round(s.y)},w:${Math.round(s.w)},h:${Math.round(s.h)}}`);
/** the paragraph the agent reads under the person's words; empty when the ask carries nothing (pure but for the blocks) */
export function askLine(project: string, a?: AskStage | null, since = ""): string {
  if (!a) return since ? [ASK, since].join("\n") : "";
  const on = (a.on ?? []).map((t) => { const words = targetWords(project, t); return words ? `${words} (block ${t.id})` : ""; }).filter(Boolean);
  const things = (a.things ?? []).filter((t) => t && KINDS.includes(t.kind)).slice(0, 12);
  if (!on.length && things.length < 2 && !since) return "";
  return [ASK,
    ...(since ? [since] : []),
    ...(on.length ? [`${ON}${on.join(SEP)}`] : []),
    ...(things.length > 1 ? [`things (hints for your compose calls, one each; merge or add as fits): ${things.map((t, i) => `${i + 1}. ${t.kind} "${String(t.title).slice(0, 80)}"${where(t.slot)}`).join("; ")}`] : []),
  ].join("\n");
}
/** the person's words and what they pointed at, from a message the agent read (askLine split off) */
export function splitAsk(text: string): { text: string; on?: string[] } {
  const i = text.indexOf(`\n\n${ASK}\n`);
  const at = i >= 0 ? i : text.startsWith(`${ASK}\n`) ? 0 : -1;
  if (at < 0) return { text };
  const tail = text.slice(at).replace(/^\n\n/, "").split("\n\n");
  const para = tail[0], rest = tail.slice(1).join("\n\n");
  const on = para.split("\n").find((l) => l.startsWith(ON))?.slice(ON.length).split(SEP).map((x) => x.replace(/ \(block [^)]*\)$/, "").trim()).filter(Boolean);
  return { text: [text.slice(0, at), rest].filter(Boolean).join("\n\n"), ...(on?.length ? { on } : {}) };
}

/** a block as the face reads it (work.stage.get): block.json, its body's text and format (a picture by its path), the last
 *  lines of its ledger (stage: joins sitting 2, #709) */
export type Seen = Block & { body?: { format: Format | "png"; text?: string; file?: string; base?: string }; lines: Line[] };
const FORMAT_OF: Record<string, Format> = { ".html": "html", ".md": "md", ".json": "json", ".txt": "text", ".diff": "diff" };
export function seen(project: string, id: string, last = 8): Seen | null {
  const b = getBlock(project, id);
  if (!b) return null;
  const f = bodyOf(project, id);
  const body = f ? (f.text !== undefined ? { format: FORMAT_OF[extname(f.file)] ?? "text", text: f.text.length > 2_000_000 ? "" : f.text } : { format: "png" as const, file: f.file }) : undefined;
  const base = body?.format === "html" ? pageBase(b) : undefined;
  return { ...b, ...(body ? { body: { ...body, ...(base ? { base } : {}) } } : {}), lines: ledger(project, id).slice(-last) };
}

/** where a page bound to an html file finds its own images, styles and scripts (#744): the file's folder, served by
 *  /pane-asset under this start's key (page.ts, the old page pane's #54), as a path on the engine. Asked each read, so
 *  the key is never kept in the body (it is new each start) (pure but for the key) */
export function pageBase(b: Pick<Block, "kind" | "bind">): string | undefined {
  if (b.kind !== "page" || !b.bind || b.bind.watch !== "file" || !isAbsolute(b.bind.source)) return undefined;
  return `/pane-asset/k.${PANE_KEY}/${encodeURIComponent(dirname(b.bind.source))}/`;
}

// ---- the stage's read (work.stage.get), whole or lighter (#870) ----
/** the words the lighter reads go by on the wire: the ask's `light` (the answer's mark too) and `id`, and the one
 *  block's place in its answer. Our pick (#870: "whatever shape you pick, say it here"), read and written through this
 *  one line, so a rename is one edit here (and the test's and PROTOCOL.md's words) */
export const STAGE_READ = { light: "light", id: "id", block: "block" } as const;
export type StageAsk = { light?: boolean; id?: string };
export type StageList = { project: string; sessionId: string; stage: Stage; blocks: (Seen | Block)[]; tray: Trayed[]; [STAGE_READ.light]?: true };
export type StageOne = { project: string; sessionId: string; [STAGE_READ.block]: Seen | null };
/** what a face asked of work.stage.get beyond its session, read off its message (pure): light only when it is exactly
 *  true, so a face that never says it is answered as ever; one block whenever an id is named (one that is no block's is
 *  still one block asked, and answers null, never the whole stage) */
export function stageAsk(m: Record<string, unknown>): StageAsk {
  const id = m[STAGE_READ.id];
  return { ...(m[STAGE_READ.light] === true ? { light: true } : {}), ...(id !== undefined && id !== null ? { id: String(id) } : {}) };
}
/** what work.stage.get answers. Asked nothing more: the stage, every block on it as `seen` gives it, and the tray, as
 *  ever. Asked light: the same, but a block folded on this stage comes as its block.json alone (its body and ledger
 *  lines were most of what crossed), and the answer says it is the light one. Asked one id: that block as `seen` gives
 *  it, or null; no other block is read and no stage is written, so a change costs the face the block that changed, not
 *  the stage. A body is never put in work.stage.changed: that goes to every face, and a body can be 2 MB */
export function stageAnswer(project: string, sid: string, ask: StageAsk = {}): StageList | StageOne {
  if (ask.id !== undefined) return { project, sessionId: sid, [STAGE_READ.block]: validId(ask.id) ? seen(project, ask.id) : null };
  const st = withProject(project, sid);   // the project's own blocks are on every session's stage (#703)
  const blocks = st.blocks.map((p) => (ask.light && p.folded ? getBlock(project, p.id) : seen(project, p.id))).filter((b): b is Seen | Block => !!b);
  return { project, sessionId: sid, stage: st, blocks, tray: trayOf(project, sid, st), ...(ask.light ? { [STAGE_READ.light]: true as const } : {}) };
}

/** a face's own layout change (a drag, a snap, tile, fold, the lens): written as it is, no ledger line (layout is not an event) */
/** a talk as kept: a known dock, a width a share between 0 and 1, the dock before full; anything else is no talk (pure) */
export function talkOf(v: unknown): Talk | null {
  const t = v as Partial<Talk> | null;
  if (!t || typeof t !== "object" || !DOCKS.includes(t.dock as Dock)) return null;
  const width = typeof t.width === "number" && Number.isFinite(t.width) && t.width > 0 && t.width < 1 ? t.width : undefined;
  const was = DOCKS.includes(t.was as Dock) && t.was !== "full" ? t.was : undefined;
  return { dock: t.dock as Dock, ...(width !== undefined ? { width } : {}), ...(was ? { was } : {}) };
}

export function layout(project: string, sid: string, patch: Partial<Stage>): Stage {
  const s = getStage(project, sid);
  // a lens named here is the session's own, or with stage.whole on the person's one lens, every stage's (#824). A
  // settings file the disk refuses loses only the lens: the rest of the layout is still saved, in the lens on disk
  if (patch.lens && LENSES.includes(patch.lens)) {
    if (!stageWhole()) s.lens = patch.lens;
    else {
      try { setUserLens(patch.lens); } catch (e) { console.error(`the lens was not saved: ${(e as Error)?.message ?? e}`); }
      s.lens = userLens();
    }
  }
  const talk = talkOf(patch.talk);
  if (talk) s.talk = talk;
  if (typeof patch.tiled === "boolean") s.tiled = patch.tiled;
  // with stage.whole on (#821): the room the face reports is kept, and a place's band goes on from the patch when it
  // names one, else from the place before, since the face writes its places back without it
  const whole = stageWhole();
  const room = whole ? roomOf(patch.room) : null;
  if (room) s.room = room;
  const bandWas = new Map(s.blocks.map((p) => [p.id, p.band]));
  const bandIn = (p: Placed): Band | undefined => (!whole ? undefined : BANDS.includes(p.band as Band) ? p.band : bandWas.get(p.id));
  if (Array.isArray(patch.blocks)) {
    const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    s.blocks = patch.blocks.filter((p) => validId(p?.id) && getBlock(project, p.id)).map((p) => ({
      id: p.id, x: n(p.x, PAD), y: n(p.y, PAD), w: Math.max(40, n(p.w, 300)), h: Math.max(40, n(p.h, 200)), z: n(p.z, 1), folded: p.folded === true,
      ...(p.slot && SLOTS.includes(p.slot) ? { slot: p.slot } : {}), ...(p.ghost === true ? { ghost: true } : {}),
      ...(p.popped ? { popped: true } : {}), ...(p.hand ? { hand: true } : {}), ...(p.lensed ? { lensed: true } : {}), ...(p.tui ? { tui: true } : {}),
      ...(p.was && [p.was.x, p.was.y, p.was.w, p.was.h].every((v) => typeof v === "number" && Number.isFinite(v)) ? { was: { x: p.was.x, y: p.was.y, w: p.was.w, h: p.was.h } } : {}),
      ...(bandIn(p) ? { band: bandIn(p) } : {}),
    }));
  }
  saveStage(project, sid, s);
  return s;
}

// ---- the watch on a bound source ----
// a file (or a test's or a run's output file) by fs.watch on its folder; a URL and a PR by asking every so often and
// comparing. A change: the block is working, one "ran" line, and live again a moment later (the face's rim drifts)
export const SETTLE_MS = 400;
export const POLL_MS = { url: 30_000, pr: 60_000, run: RUN_POLL_MS };
type Armed = { stop: () => void; project: string };
const armed = new Map<string, Armed>();
let asker: (b: Bind) => Promise<string> = defaultAsk;
/** how a URL or a PR is read for its change (tests give their own) */
export const setAsker = (f: ((b: Bind) => Promise<string>) | null) => { asker = f ?? defaultAsk; };

async function defaultAsk(b: Bind): Promise<string> {
  if (b.watch === "url") {
    const r = await fetch(b.source, { signal: AbortSignal.timeout(10_000) });
    return createHash("sha1").update(`${r.status}\n${r.headers.get("etag") ?? ""}\n${await r.text()}`).digest("hex");
  }
  const n = /(\d+)\/?$/.exec(b.source)?.[1] ?? b.source.replace(/^#/, "");
  return new Promise((ok, no) => execFile("gh", ["pr", "view", n, "--json", "state,headRefOid,statusCheckRollup,reviewDecision"], { timeout: 20_000 }, (e, out) => (e ? no(e) : ok(createHash("sha1").update(out).digest("hex")))));
}

/** the source changed: working now, a line, live after the settle; a page bound to a text file takes its new text */
export function sourceChanged(project: string, id: string, by = "the watch") {
  const b = getBlock(project, id);
  if (!b || b.state === "dead" || !b.bind) return;
  const wasWaiting = b.state === "waits", wasFrozen = b.state === "frozen";
  if (!wasFrozen) {
    b.state = "working";
    saveBlock(project, b);
    tell({ project: projectName(project), block: b });
    pull(project, b);
  }
  // a frozen block's source moving on never touches the version; the line notes it, the frame stays pearl
  const line = append(project, id, "ran", by, `${b.bind.source} changed${wasFrozen ? " (the frozen version is kept)" : ""}`);
  tell({ project: projectName(project), block: b, line });
  if (wasFrozen) return;
  setTimeout(() => {
    const now = getBlock(project, id);
    if (!now || now.state !== "working") return;
    now.state = wasWaiting ? "waits" : "live";
    saveBlock(project, now);
    tell({ project: projectName(project), block: now });
  }, SETTLE_MS).unref?.();
}

// a page, a diff or a card bound to a text file shows the file's text: its body is the file's, taken at bind and each change
function pull(project: string, b: Block) {
  if (isRun(b)) { void takeRunFrom(project, b.id); return; }
  if (!b.bind || b.bind.watch !== "file" || !(b.kind === "page" || b.kind === "diff" || b.kind === "card")) return;
  try {
    const st = statSync(b.bind.source);
    if (!st.isFile() || st.size > 2_000_000) return;
    const text = readFileSync(b.bind.source, "utf8");
    const ext = extname(b.bind.source).toLowerCase();
    writeBody(project, b.id, text, ext === ".html" || ext === ".htm" || ext === ".svg" ? "html" : ext === ".md" ? "md" : ext === ".json" ? "json" : ext === ".diff" || ext === ".patch" ? "diff" : "text");
  } catch { /* not there (yet): the next change brings it */ }
}

function arm(project: string, b: Block) {
  disarm(b.id);
  if (!b.bind || !b.bind.watch || b.state === "dead") return;
  const { source, watch: as } = b.bind;
  if (isRun(b) && /^https?:\/\//.test(source)) {
    // a run on a URL (the watcher's status.json): asked every ten seconds, its sessions written into the list
    let gone = false;
    const tick = () => { if (!gone) void takeRunFrom(project, b.id); };
    const iv = setInterval(tick, POLL_MS.run);
    iv.unref?.();
    armed.set(b.id, { project, stop: () => { gone = true; clearInterval(iv); } });
    return;
  }
  if (as === "file" || as === "test" || as === "run") {
    // the folder is watched, not the file: an editor that saves by replacing the file keeps the watch alive
    const dir = dirname(source), name = basename(source);
    let fw: FSWatcher | null = null, t: NodeJS.Timeout | undefined;
    try {
      fw = watch(dir, (_e, f) => {
        if (f && String(f) !== name) return;
        clearTimeout(t);
        t = setTimeout(() => (isRun(b) ? void takeRunFrom(project, b.id) : sourceChanged(project, b.id)), 120);
      });
      fw.on("error", () => {});
      fw.unref?.();
    } catch { return; }   // no folder yet: the next bind arms it
    armed.set(b.id, { project, stop: () => { clearTimeout(t); fw?.close(); } });
    return;
  }
  let last: string | null = null, gone = false;
  const tick = async () => {
    if (gone) return;
    try { const h = await asker(b.bind!); if (last !== null && h !== last) sourceChanged(project, b.id); last = h; } catch { /* asked again next time */ }
  };
  void tick();
  const iv = setInterval(tick, POLL_MS[as]);
  iv.unref?.();
  armed.set(b.id, { project, stop: () => { gone = true; clearInterval(iv); } });
}
function disarm(id: string) { armed.get(id)?.stop(); armed.delete(id); }
/** the bound blocks of every project watched again (the engine started, or the switch turned on) */
export function armAll() { for (const p of projects()) for (const b of allBlocks(p)) if (b.bind?.watch && !armed.has(b.id)) arm(p, b); }
/** every watch stopped (the switch turned off; a test's end) */
export function disarmAll() { for (const id of [...armed.keys()]) disarm(id); }
export const watching = () => [...armed.keys()];

// ---- what runs in the background (#703, background.ts): a list bound with watch "run" ----
/** a list whose steps are a run's sessions (pure) */
export const isRun = (b: Pick<Block, "kind" | "bind">) => b.kind === "list" && b.bind?.watch === "run";
const runOf = (project: string, id: string): RunBody | null => {
  const t = bodyOf(project, id)?.text;
  try { const v = t ? JSON.parse(t) : null; return v && Array.isArray(v.steps) && v.steps.every((x: any) => x?.run) ? v as RunBody : null; } catch { return null; }
};
/** a run's source as it reads now, into its list: the body written only when it changed; the block waits while a
 *  session needs the person, works while one works, else is live; a ledger line each time a session comes or moves from
 *  one state to another (never one per read). A frozen block keeps its version and its body */
export function takeRun(project: string, id: string, src: unknown, by = "the run"): Block | null {
  const b = getBlock(project, id);
  if (!b || !b.bind || !isRun(b) || b.state === "dead" || b.state === "frozen") return b;
  const was = runOf(project, id);
  const now = runBody(src, whereOf(b.bind.source, (src as { host?: unknown } | null)?.host));
  const text = JSON.stringify(now), state = runState(now);
  if (was && JSON.stringify(was) === text && b.state === state) return b;
  writeBody(project, id, text, "json");
  b.state = state;
  saveBlock(project, b);
  const notes = runMoves(was, now);
  let line: Line | undefined;
  for (const n of notes) line = append(project, id, / → waits/.test(n) || (!was && / waits$/.test(n)) ? "waits" : "ran", by, n);
  tell({ project: projectName(project), block: b, ...(line ? { line } : {}) });
  return b;
}
/** the run's source read again and taken; a source that does not answer leaves the list as it was */
export async function takeRunFrom(project: string, id: string): Promise<Block | null> {
  const b = getBlock(project, id);
  if (!b?.bind || !isRun(b)) return b;
  try { return takeRun(project, id, await readRun(b.bind.source)); } catch { return b; }
}

/** a session's stage with the project's own blocks on it (#703): a block that is the project's and open, not on this
 *  stage yet and not left by it (#870), comes folded (its chip), and the session is one of its sessions. Written only
 *  when something came */
export function withProject(project: string, sid: string): Stage {
  const s = getStage(project, sid);
  const come = allBlocks(project).filter((b) => b.scope === "project" && opensOn(b) && !s.blocks.some((p) => p.id === b.id) && !s.left?.includes(b.id));
  if (!come.length) return s;
  let z = Math.max(0, ...s.blocks.map((p) => p.z));
  const whole = stageWhole();
  for (const b of come.reverse()) {
    if (whole) { const { band, w, h } = bornIn(b.kind, roomFor(s)); s.blocks.push({ id: b.id, x: PAD, y: PAD, w, h, z: ++z, folded: true, auto: true, band }); }   // #821
    else { const [bw, bh] = SIZES[b.kind]; s.blocks.push({ id: b.id, x: PAD, y: PAD, w: bw, h: bh, z: ++z, folded: true, auto: true }); }
    if (!b.sessions.includes(sid)) { b.sessions.push(sid); saveBlock(project, b); }
  }
  saveStage(project, sid, s);
  return s;
}

/** what GET /blocks answers: each project's blocks, with their last ledger line */
export function blocksNow(only?: string): { project: string; blocks: (Block & { last?: Line })[] }[] {
  return projects().filter((p) => !only || p === projectName(only)).map((p) => ({ project: p, blocks: allBlocks(p).map((b) => { const l = ledger(p, b.id); return { ...b, ...(l.length ? { last: l[l.length - 1] } : {}) }; }) }));
}

/** the one block a session keeps under a fixed id (a browser's stills, live.ts): found by its id, else made */
export function keepOne(w: Who, id: string, a: Omit<ComposeArgs, "id">): Block {
  const b = getBlock(w.project, id);
  if (!b) return compose(w, { ...a, id });
  if (b.state === "dead") {
    // closed, then asked for again: the same block comes back, its ledger whole (a ledger is never cut)
    b.state = "live";
    saveBlock(w.project, b);
    const line = append(w.project, id, "composed", w.by, "again, after it was closed");
    tell({ project: projectName(w.project), sessionId: w.sessionId, block: b, line });
    onStage(w.project, w.sessionId, b, a.slot);
  }
  if (!b.sessions.includes(w.sessionId)) place(w, { id });
  return update(w, { id, body: a.body, format: a.format, title: a.title });
}
/** the page block bound to this file, if there is one */
export const boundTo = (project: string, source: string) => allBlocks(project).find((b) => b.bind?.source === source) ?? null;

// ---- who asks: the session's folder (its project) and how a line is signed; wire.ts tells it ----
let finder: (sessionId: string) => Promise<{ cwd?: string; by?: string }> = async () => ({});
export const setStageFinder = (f: (sessionId: string) => Promise<{ cwd?: string; by?: string }>) => { finder = f; };
/** the session as the store sees it: its project (from its folder), and the name its lines are signed with */
export async function whoFor(sessionId: string, seat = "work"): Promise<Who> {
  if (!SID.test(sessionId)) throw new Error("the stage needs a session");
  const f = await finder(sessionId).catch(() => ({} as { cwd?: string; by?: string }));
  const cwd = f.cwd ?? process.cwd();
  return { project: projectOf(cwd), sessionId, cwd, by: f.by ?? `${seat} agent · ${sessionId.slice(0, 8)}` };
}

// ---- the page watcher's alias: a page the session writes is a page block bound to its file ----
const PAGE = /\.(html?|svg)$/i;
const WRITES = new Set(["Write", "Edit", "MultiEdit"]);
/** the pages an SDK message shows written: a Write or an Edit of an absolute .html/.svg path, counted once its result is
 *  ok (the face's pages.ts reads the talk the same way). `pending` holds the calls between the two messages (pure but for it) */
export function pagesWritten(a: any, pending: Map<string, string>): string[] {
  const content = a?.message?.content;
  if (!Array.isArray(content)) return [];
  const out: string[] = [];
  for (const b of content) {
    if (a.type === "assistant" && b?.type === "tool_use" && WRITES.has(String(b.name))) {
      const p = String(b.input?.file_path ?? "");
      if (p.startsWith("/") && PAGE.test(p)) pending.set(String(b.id), p);
    } else if (a.type === "user" && b?.type === "tool_result" && pending.has(String(b.tool_use_id))) {
      const p = pending.get(String(b.tool_use_id))!;
      pending.delete(String(b.tool_use_id));
      if (!b.is_error) out.push(p);
    }
  }
  return out;
}
/** a page written in a session: its block (bound to the file, watched) on that session's stage, made the first time */
export async function pageWritten(sessionId: string, path: string): Promise<Block> {
  const w = await whoFor(sessionId);
  const b = boundTo(w.project, path);
  if (!b) return compose(w, { kind: "page", title: basename(path), bind: { source: path, watch: "file" } });
  if (!b.sessions.includes(sessionId) || !getStage(w.project, sessionId).blocks.some((p) => p.id === b.id)) place(w, { id: b.id });
  if (!armed.has(b.id)) { arm(w.project, b); sourceChanged(w.project, b.id); }   // the watch was not on (an engine start): this write is the change
  return b;
}

// ---- pieces (#1092, pieces.ts): a block the project keeps before any session holds it ----
/** a piece's block, made with no session (it sits in the project's folder until it is dropped into one), else found;
 *  its body written quietly each time. Its ledger says it was made once */
export function keepStanding(project: string, id: string, a: { kind: Kind; title: string; body: string; format?: Format; by: string }): Block {
  let b = getBlock(project, id);
  if (!b) {
    b = { id, kind: a.kind, title: a.title.trim().slice(0, 80) || a.kind, bind: null, state: "live", parent: null, versions: [], sessions: [], at: Date.now() };
    writeBody(project, id, a.body, a.format ?? DEFAULT_FORMAT[a.kind]);
    saveBlock(project, b);
    const line = append(project, id, "composed", a.by, `${a.kind} "${b.title}", a piece`);
    tell({ project: projectName(project), block: b, line });
    return b;
  }
  if (b.title !== a.title.trim().slice(0, 80) && a.title.trim()) { b.title = a.title.trim().slice(0, 80); saveBlock(project, b); }
  writeBody(project, id, a.body, a.format ?? DEFAULT_FORMAT[b.kind]);
  tell({ project: projectName(project), block: b });
  return b;
}
/** a block's state set with no ledger line (a piece working, waiting, live again), its sessions kept or cut; the face is told */
export function setState(project: string, id: string, state: State, sessions?: string[]): Block | null {
  const b = getBlock(project, id);
  if (!b) return null;
  b.state = state;
  if (sessions) b.sessions = sessions;
  saveBlock(project, b);
  tell({ project: projectName(project), block: b });
  return b;
}
