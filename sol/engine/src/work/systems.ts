// The system stage block (#1091): one area of the registry (sol/systems/records) drawn in five lanes, read live. The
// engine reads the records, keeps the area's systems and every system wired to them one hop out, lays each in its lane
// (its `layer`, else guessed from its kind), orders a lane by how much it reaches downstream, and derives each system's
// ring (signal, owner, decision, change, check) from what its record says. Nothing here is typed in: a record that
// changes on disk goes to every face that shows the area (work.systems.changed), and git's history of the records is
// the area's growth, played back on the face.
//
//   work.systems.area    { area }  → { view }               the area as it stands on disk now
//   work.systems.history { area }  → { frames: [{ sha, at, subject, view }] }   one frame per commit that changed it
//   work.systems.changed { area, view }                     to every face, when a record file changes
import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, watch, type Dirent, type FSWatcher } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const LAYERS = ["why", "rules", "source", "machine", "surface"] as const;
export type Layer = (typeof LAYERS)[number];
export const BEATS = ["signal", "owner", "decision", "change", "check"] as const;
export type Beat = (typeof BEATS)[number];
export type Ring = Record<Beat, boolean>;

/** a record as the registry keeps it (sol/systems/README.md), the fields this block reads */
export type Rec = {
  id: string; name: string; about: string; parent: string | null; kind: string; owner?: string; state: string;
  where?: { paths?: string[]; machines?: string[]; urls?: string[] }; feeds?: string[]; fed_by?: string[];
  health?: object[]; note?: string; layer?: string; decided?: string; gaps?: { to: string; why: string }[];
};
export type Tile = {
  id: string; name: string; about: string; kind: string; state: string; owner: string;
  layer: Layer; guessed: boolean; weight: number; ring: Ring; decided?: string; paths: string[]; machines: string[];
  /** inside the area (else one hop out, wired to it) */
  inArea: boolean; note?: string;
  /** an area's own parts, by name (the modes of product) */
  parts?: string[];
};
export type Gap = { from: string; to: string; why: string };
export type View = {
  area: string; name: string; about: string;
  /** lane by lane, heaviest first within a lane */
  tiles: Tile[]; wires: [string, string][]; gaps: Gap[];
  /** systems of the area with no wire yet: named under the lanes, not drawn */
  loose: { id: string; name: string }[];
  /** legacy systems of the area, left out */
  legacy: number;
};

// ---- where ----
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
/** the records the block reads: SOL_SYSTEMS_RECORDS (a test's copy), else the checkout's */
export const recordsDir = () => process.env.SOL_SYSTEMS_RECORDS ?? join(REPO, "sol", "systems", "records");
/** whether this checkout has the registry: a Sol developer's does; a Sol tester's (the sol-beta export) never offers the block */
export const hasSystems = () => existsSync(recordsDir());

/** every .json under a folder; a symlink is never followed (a loop, or a record from outside the registry) */
function walk(dir: string, out: string[] = []): string[] {
  let ents: Dirent[] = [];
  try { ents = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)); } catch { return out; }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.isFile() && e.name.endsWith(".json")) out.push(p);
  }
  return out;
}
const str = (x: unknown) => typeof x === "string";
const strs = (x: unknown) => x === undefined || (Array.isArray(x) && x.every(str));
const opt = (x: unknown) => x === undefined || str(x);
/** a parsed record when every field this block reads has the type it should, else null: the check refuses a wrong one,
 *  and the block must never break on it (pure) */
export function saneRec(r: unknown): Rec | null {
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  const x = r as Record<string, unknown>, w = x.where as Record<string, unknown> | undefined;
  const ok = str(x.id) && str(x.name) && opt(x.about) && (x.parent === null || str(x.parent)) && str(x.kind) && str(x.state) &&
    opt(x.owner) && opt(x.note) && opt(x.layer) && opt(x.decided) && strs(x.feeds) && strs(x.fed_by) &&
    (x.health === undefined || Array.isArray(x.health)) &&
    (w === undefined || (!!w && typeof w === "object" && !Array.isArray(w) && strs(w.paths) && strs(w.machines))) &&
    (x.gaps === undefined || (Array.isArray(x.gaps) && x.gaps.every((g) => !!g && typeof g === "object" && str(g.to) && str(g.why))));
  return ok ? ({ about: "", ...x } as Rec) : null;
}
/** a record file the block could not read: its id when it says one, else its place under the records */
export type Unreadable = { id: string; file: string };
/** every record that reads, by id, and the files that did not (half-written, broken, or a field of the wrong type) */
export function readRegistry(dir = recordsDir()): { recs: Map<string, Rec>; bad: Unreadable[] } {
  const recs = new Map<string, Rec>(), bad: Unreadable[] = [];
  for (const f of walk(dir)) {
    const file = relative(dir, f).split(sep).join("/");
    let raw: unknown = null;
    try { raw = JSON.parse(readFileSync(f, "utf8")); } catch { /* half-written or broken */ }
    const r = saneRec(raw);
    if (r) recs.set(r.id, r);
    else {
      const said = raw && typeof raw === "object" ? (raw as { id?: unknown }).id : undefined;
      bad.push({ id: typeof said === "string" ? said : file.replace(/\.json$/, ""), file });
    }
  }
  return { recs, bad };
}
/** every record that reads, by id; one that does not is left out (readRegistry names it) */
export const readRecords = (dir = recordsDir()): Map<string, Rec> => readRegistry(dir).recs;

// ---- the pure parts ----
const GUESS: Record<string, Layer> = { doc: "rules", practice: "rules", store: "source", tool: "machine", service: "machine", timer: "machine", check: "machine", part: "surface", channel: "surface" };
/** a system's lane: its own `layer`, else the one its kind suggests (marked guessed); an area or a machine has none */
export function layerOf(r: Pick<Rec, "layer" | "kind">): { layer: Layer; guessed: boolean } | null {
  if (r.layer && (LAYERS as readonly string[]).includes(r.layer)) return { layer: r.layer as Layer, guessed: false };
  const g = GUESS[r.kind];
  return g ? { layer: g, guessed: true } : null;
}

/** every feed among the given records, once each: a's feeds naming b, or b's fed_by naming a */
export function wiresOf(recs: Map<string, Rec>, keep: (id: string) => boolean = () => true): [string, string][] {
  const out = new Map<string, [string, string]>();
  const add = (a: string, b: string) => { if (a !== b && keep(a) && keep(b) && recs.has(a) && recs.has(b)) out.set(`${a}>${b}`, [a, b]); };
  for (const r of recs.values()) {
    for (const t of r.feeds ?? []) add(r.id, t);
    for (const t of r.fed_by ?? []) add(t, r.id);
  }
  return [...out.values()];
}

/** how much a system reaches: Σ 0.5^(d-1) over every system downstream of it, d its distance (pure) */
export function weightOf(id: string, wires: [string, string][]): number {
  const out = new Map<string, string[]>();
  for (const [a, b] of wires) out.set(a, [...(out.get(a) ?? []), b]);
  const seen = new Set([id]); let wave = [id], d = 0, w = 0;
  while (wave.length) {
    d++;
    const next: string[] = [];
    for (const x of wave) for (const y of out.get(x) ?? []) if (!seen.has(y)) { seen.add(y); next.push(y); w += 0.5 ** (d - 1); }
    wave = next;
  }
  return w;
}

/** the five beats a system must close, read from its record: a health probe; an owner; where it was decided; paths to
 *  change; a check (a system of kind check) that feeds it (pure) */
export function ringOf(r: Rec, recs: Map<string, Rec>, wires: [string, string][] = wiresOf(recs)): Ring {
  return {
    signal: (r.health ?? []).length > 0,
    owner: typeof r.owner === "string" && r.owner.trim() !== "",
    decision: typeof r.decided === "string" && r.decided.trim() !== "",
    change: (r.where?.paths ?? []).length > 0,
    check: wires.some(([a, b]) => b === r.id && recs.get(a)?.kind === "check"),
  };
}

const inside = (id: string, area: string, recs: Map<string, Rec>) => {
  const seen = new Set<string>();
  for (let p = recs.get(id)?.parent; p && !seen.has(p); p = recs.get(p)?.parent) { if (p === area) return true; seen.add(p); }
  return false;
};

/** an area's own parts, by name: the ones its spine hops between (product/spine feeds the four modes), else its areas */
export function partsOf(id: string, recs: Map<string, Rec>): string[] {
  const kids = [...recs.values()].filter((c) => c.parent === id && c.state !== "legacy");
  const spine = recs.get(`${id}/spine`), hops = new Set(spine?.feeds ?? []);
  const by = hops.size ? kids.filter((c) => hops.has(c.id)) : kids.filter((c) => c.kind === "area");
  return by.map((c) => c.name);
}

/** the area as the block draws it (pure over the records); a record file of the area that did not read is named in
 *  the loose list as unreadable */
export function areaView(recs: Map<string, Rec>, area: string, bad: Unreadable[] = []): View {
  const root = recs.get(area);
  const all = wiresOf(recs);
  const own = [...recs.values()].filter((r) => r.id !== area && inside(r.id, area, recs));
  const legacy = own.filter((r) => r.state === "legacy").length;
  const mine = new Set(own.filter((r) => r.state !== "legacy").map((r) => r.id));
  // one hop out: wired (or gapped) to a system of the area, in either direction
  const near = new Set<string>();
  const touch = (a: string, b: string) => { if (mine.has(a) && !mine.has(b)) near.add(b); if (mine.has(b) && !mine.has(a)) near.add(a); };
  for (const [a, b] of all) touch(a, b);
  for (const r of recs.values()) for (const g of r.gaps ?? []) touch(r.id, g.to);
  // what may stand in a lane: not legacy, not the area itself, and a lane of its own (an area joins only by its layer)
  const can = (id: string) => { const r = recs.get(id); return !!r && id !== area && r.state !== "legacy" && !!layerOf(r); };
  const cand = new Set([...mine, ...near].filter(can));
  const wires = all.filter(([a, b]) => cand.has(a) && cand.has(b));
  const gaps: Gap[] = [];
  for (const r of recs.values()) for (const g of r.gaps ?? []) {
    if (cand.has(r.id) && cand.has(g.to) && !wires.some(([a, b]) => a === r.id && b === g.to)) gaps.push({ from: r.id, to: g.to, why: g.why });
  }
  const wired = new Set([...wires.flat(), ...gaps.flatMap((g) => [g.from, g.to])]);
  // drawn: a system with a wire, or one that says its lane; one hop out only when wired (it came for the wire)
  const drawn = [...cand].filter((id) => wired.has(id) || (mine.has(id) && !!recs.get(id)!.layer));
  const ds = new Set(drawn);
  const dw = wires.filter(([a, b]) => ds.has(a) && ds.has(b));
  const order = (t: Tile) => LAYERS.indexOf(t.layer);
  const tiles = drawn.map((id): Tile => {
    const r = recs.get(id)!, l = layerOf(r)!;
    return {
      id, name: r.name, about: r.about, kind: r.kind, state: r.state, owner: r.owner ?? "", layer: l.layer, guessed: l.guessed,
      weight: weightOf(id, dw), ring: ringOf(r, recs, all), ...(r.decided ? { decided: r.decided } : {}),
      paths: r.where?.paths ?? [], machines: r.where?.machines ?? [], inArea: mine.has(id), ...(r.note ? { note: r.note } : {}),
      ...(r.kind === "area" ? { parts: partsOf(id, recs) } : {}),
    };
  }).sort((a, b) => order(a) - order(b) || b.weight - a.weight || a.name.localeCompare(b.name));
  const loose = [...mine].filter((id) => !ds.has(id)).map((id) => ({ id, name: recs.get(id)!.name })).sort((a, b) => a.name.localeCompare(b.name));
  for (const u of bad) if (u.id.startsWith(`${area}/`) && !recs.has(u.id)) loose.push({ id: u.id, name: `${u.id} (unreadable)` });
  return { area, name: root?.name ?? area, about: root?.about ?? "", tiles, wires: dw, gaps, loose, legacy };
}

// ---- the lens (#1220): what one conversation points at on a system block, written beside the area in its body. The
// face lays it over the map (sol/mac/src/stage/kinds/system/lens.ts); the engine refuses a lens that names a system the
// area does not draw, by name, so the agent fixes its walk instead of drawing nothing ----
export const LENS_MARKS = ["cut", "redo", "keep", "new", "you"] as const;
const LENS_KEYS = ["focus", "path", "say", "step", "mark", "fit", "view", "show"];
const SHOWS = ["today", "after", "both"];
/** at most this many systems on a path, and this long a sentence */
export const LENS_PATH_MAX = 12, LENS_SAY_MAX = 240;
/** why a lens cannot stand on this view, in one sentence, or null when it can (pure) */
export function lensError(v: View, lens: unknown): string | null {
  if (!obj(lens)) return "lens is an object: { focus?, path?, say?, step?, mark?, fit?, view?, show? }";
  const extra = Object.keys(lens).filter((k) => !LENS_KEYS.includes(k));
  if (extra.length) return `lens has no ${extra.map((k) => `"${k}"`).join(", ")}; its fields are ${LENS_KEYS.join(", ")}`;
  const drawn = new Set(v.tiles.map((t) => t.id));
  const list = () => { const ids = [...drawn]; return ids.slice(0, 12).join(", ") + (ids.length > 12 ? ` and ${ids.length - 12} more` : ""); };
  const notDrawn = (where: string, id: string) => `lens.${where} names "${id}", which ${v.area} does not draw; it draws ${list() || "nothing yet"}`;
  const ids = (where: string, xs: string[]) => { for (const id of xs) if (!drawn.has(id)) return notDrawn(where, id); return null; };
  const { focus, path, say, step, mark, fit, view, show } = lens;
  if (focus !== undefined) { if (!str(focus)) return "lens.focus is one system's id"; const e = ids("focus", [focus]); if (e) return e; }
  if (path !== undefined) {
    if (!Array.isArray(path) || !path.every(str)) return "lens.path is a list of system ids, in walking order";
    if (path.length > LENS_PATH_MAX) return `lens.path walks at most ${LENS_PATH_MAX} systems`;
    const e = ids("path", path); if (e) return e;
  }
  if (say !== undefined && (!str(say) || say.length > LENS_SAY_MAX)) return `lens.say is one sentence, at most ${LENS_SAY_MAX} characters`;
  if (step !== undefined) {
    const ok = Array.isArray(step) && step.length === 2 && step.every((n) => Number.isInteger(n)) && step[0] >= 1 && step[0] <= step[1];
    if (!ok) return "lens.step is [n, of], whole numbers with 1 ≤ n ≤ of";
  }
  if (mark !== undefined) {
    if (!obj(mark)) return `lens.mark is { "<id>": one of ${LENS_MARKS.join(", ")} }`;
    for (const [id, m] of Object.entries(mark)) {
      if (!(LENS_MARKS as readonly unknown[]).includes(m)) return `lens.mark on "${id}" is one of ${LENS_MARKS.join(", ")}, not ${JSON.stringify(m)}`;
      const e = ids("mark", [id]); if (e) return e;
    }
  }
  if (fit !== undefined) {
    if (!str(fit)) return "lens.fit is \"path\", \"area\" or one system's id";
    if (fit !== "path" && fit !== "area") { const e = ids("fit", [fit]); if (e) return e; }
  }
  if (view !== undefined && view !== "lanes" && view !== "window") return "lens.view is \"lanes\" or \"window\"";
  if (show !== undefined) {
    if (!obj(show)) return `lens.show is { "<id>": one of ${SHOWS.join(", ")} }`;
    for (const [id, s] of Object.entries(show)) {
      if (!SHOWS.includes(s as string)) return `lens.show on "${id}" is one of ${SHOWS.join(", ")}, not ${JSON.stringify(s)}`;
      const e = ids("show", [id]); if (e) return e;
    }
  }
  return null;
}
/** why a system block's body cannot be drawn as written, or null. Only a body with a lens is checked: a body that is not
 *  JSON or names no lens keeps what it did before (the face says what it lacks) (pure over the registry it is given) */
export function systemBodyError(body: string, reg: () => { recs: Map<string, Rec>; bad: Unreadable[] } = readRegistry): string | null {
  let b: unknown;
  try { b = JSON.parse(body); } catch { return null; }
  if (!obj(b) || b.lens === undefined) return null;
  if (!str(b.area) || !b.area) return "a lens needs the area it walks: { \"area\": \"design\", \"lens\": { … } }";
  const { recs, bad } = reg();
  const v = areaView(recs, b.area, bad);
  if (!recs.has(b.area) && !v.tiles.length) return `no area "${b.area}" in the systems registry`;
  return lensError(v, b.lens);
}

// ---- what a few faces show, read from the files they are about (never typed into the face) ----
export type Facts = {
  /** sol/design/system/tokens.json: the one black, the window's shade over the desk, its blur, a block's corner, the six */
  tokens?: { black: string; window: number; blur: number; corner: number; six: { name: string; hex: string }[] };
  /** the files that type the window's default look (its black and its shade), tokens.json first */
  typed?: string[];
  /** the website's own colours (site/index.html's :root) */
  site?: { page: string; ink: string };
};
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
async function filesUnder(dir: string, out: string[] = []): Promise<string[]> {
  let ents: Dirent[] = [];
  try { ents = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const n = e.name;
    if (n === "node_modules" || n.startsWith(".")) continue;
    const p = join(dir, n);
    if (e.isDirectory()) await filesUnder(p, out); else if (e.isFile() && /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}
/** the tokens the faces show, from tokens.json's palette whatever shape it has (a part that is not there is left out) */
export function tokensOf(json: unknown): Facts["tokens"] {
  const t = obj(json) ? json.palette : null;
  if (!obj(t) || !obj(t.shade) || !obj(t.curve) || !obj(t.jelly) || !obj(t.creature)) return undefined;
  const c = obj(t.creature.colours) ? t.creature.colours : {}, six = Array.isArray(t.jelly.six) ? t.jelly.six : [];
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : Number(x) || 0);
  return {
    black: String(t.shade.black ?? ""), window: num(t.shade.window), blur: num(t.shade.blur),
    corner: num(obj(t.curve.radius) ? t.curve.radius.block : 0),
    six: six.filter((n): n is string => typeof n === "string").map((name) => ({ name, hex: typeof c[name] === "string" ? (c[name] as string) : "" })).filter((x) => x.hex),
  };
}
/** the facts the faces read, from the repo the records are in (`repo`: its top); `typed` walks the face's and the
 *  engine's sources for the files that type the default look, so it is asked only when a tile on screen shows it.
 *  Never throws: a file that is missing or not the shape it should be leaves its fact out */
export async function factsOf(repo = REPO, want: { typed?: boolean } = { typed: true }): Promise<Facts> {
  const out: Facts = {};
  try {
    let json: unknown = null;
    try { json = JSON.parse(await readFile(join(repo, "sol", "design", "system", "tokens.json"), "utf8")); } catch { /* not there, or broken */ }
    const tk = tokensOf(json);
    if (tk) {
      out.tokens = tk;
      if (want.typed) {
        // the default look typed by hand: a line that holds both the black and the window's shade
        const black = JSON.stringify(tk.black), shade = new RegExp(`alpha:\\s*${String(tk.window).replace(".", "\\.")}\\b`);
        const typed = ["sol/design/system/tokens.json"];
        for (const f of [...await filesUnder(join(repo, "sol", "mac", "src")), ...await filesUnder(join(repo, "sol", "engine", "src"))]) {
          try { if ((await readFile(f, "utf8")).split("\n").some((l) => l.includes(black) && shade.test(l))) typed.push(relative(repo, f).split(sep).join("/")); } catch { /* unreadable */ }
        }
        out.typed = typed;
      }
    }
  } catch { /* the tokens' facts are left out */ }
  try {
    const html = await readFile(join(repo, "site", "index.html"), "utf8");
    const v = (k: string) => new RegExp(`--${k}:\\s*([^;]+);`).exec(html)?.[1]?.trim() ?? "";
    if (v("page")) out.site = { page: v("page"), ink: v("ink") };
  } catch { /* no site in this checkout */ }
  return out;
}
/** the tiles whose face shows `typed` (faces.tsx YourLook) */
const TYPED_BY = new Set(["product/settings/look"]);
export const needsTyped = (vs: View[]) => vs.some((v) => v.tiles.some((t) => TYPED_BY.has(t.id)));
/** a watch tick: the facts are read again at most once per tick (and at most once a minute between ticks) */
let tick = 0;
const KEEP_MS = 60_000;
const factsKept = new Map<string, { tick: number; at: number; p: Promise<Facts> }>();
/** the facts for the views on screen, kept: read only when no kept one serves (one with `typed` serves one without) */
export function factsFor(views: View[], repo = REPO): Promise<Facts> {
  const typed = needsTyped(views), now = Date.now();
  const fresh = (k: string) => { const x = factsKept.get(k); return x && x.tick === tick && now - x.at < KEEP_MS ? x.p : null; };
  const kept = fresh(`${repo}|1`) ?? (typed ? null : fresh(`${repo}|0`));
  if (kept) return kept;
  const p = factsOf(repo, { typed }).catch((): Facts => ({}));
  factsKept.set(`${repo}|${typed ? 1 : 0}`, { tick, at: now, p });
  return p;
}
/** the next watch tick: what was kept is read again when next asked */
export const nextTick = () => { tick++; factsKept.clear(); };

/** whether two views draw the same (the history keeps a frame only when the area changed) */
export const sameView = (a: View, b: View) => JSON.stringify(a) === JSON.stringify(b);

// ---- the history: git's commits of the records, each one a frame of the area ----
export type Frame = { sha: string; at: number; subject: string; view: View };
const gitBuf = (cwd: string, args: string[], input?: string) => new Promise<Buffer>((ok, no) => {
  const p = execFile("git", args, { cwd, maxBuffer: 64 << 20, encoding: "buffer" }, (e, out) => (e ? no(e) : ok(out)));
  if (input !== undefined) p.stdin?.end(input);
});
const git = async (cwd: string, args: string[]) => (await gitBuf(cwd, args)).toString("utf8");
const blobs = new Map<string, Rec | null>();   // a blob never changes: parsed once
const told = new Map<string, { key: string; frames: Frame[] }>();   // by area: only the latest, keyed by the records' last commit
/** the area's growth: one frame per commit of the records that changed what the area draws, oldest first */
export async function history(area: string, dir = recordsDir()): Promise<Frame[]> {
  const top = (await git(dir, ["rev-parse", "--show-toplevel"])).trim();
  const rel = relative(top, dir).split(sep).join("/");
  const log = (await git(top, ["log", "--reverse", "--format=%H%x09%at%x09%s", "--", rel])).split("\n").filter(Boolean);
  const key = `${top}|${rel}|${log.at(-1) ?? ""}`;
  const kept = told.get(area);
  if (kept?.key === key) return kept.frames;
  const frames: Frame[] = [];
  for (const l of log) {
    const [sha, at, ...s] = l.split("\t");
    const tree = (await git(top, ["ls-tree", "-r", sha, "--", rel])).split("\n").filter((x) => x.endsWith(".json"));
    const want = tree.map((x) => x.split(/\s+/)[2]).filter((b) => !blobs.has(b));
    if (want.length) {
      const out = await gitBuf(top, ["cat-file", "--batch"], want.join("\n") + "\n");
      let i = 0;
      while (i < out.length) {   // "<blob> blob <size>\n<size bytes>\n", one after another
        const nl = out.indexOf(10, i), [b, , size] = out.subarray(i, nl).toString().split(" "), n = Number(size);
        if (!Number.isFinite(n)) break;
        try { blobs.set(b, saneRec(JSON.parse(out.subarray(nl + 1, nl + 1 + n).toString("utf8")))); } catch { blobs.set(b, null); }
        i = nl + 1 + n + 1;
      }
    }
    const recs = new Map<string, Rec>();
    for (const x of tree) { const r = blobs.get(x.split(/\s+/)[2]); if (r) recs.set(r.id, r); }
    const view = areaView(recs, area);
    if (!frames.length ? view.tiles.length > 0 : !sameView(frames[frames.length - 1].view, view)) frames.push({ sha, at: Number(at) * 1000, subject: s.join("\t"), view });
  }
  told.set(area, { key, frames });
  return frames;
}

// ---- the watch: a record that changes on disk goes to every face showing its area ----
type Face = { send: (m: object) => void };
type Changed = { type: "work.systems.changed"; area: string; view: View; facts: Facts };
let watcher: FSWatcher | null = null, watched = "", timer: NodeJS.Timeout | undefined;
/** the areas a face shows, and the faces showing each: a face that leaves lets its areas go (dropFace), and at most
 *  MAX_SHOWN areas are held, the one asked longest ago let go first */
const shown = new Map<string, Set<Face>>();
export const MAX_SHOWN = 8;
export const shownAreas = () => [...shown.keys()];
function hold(area: string, face: Face) {
  const faces = shown.get(area) ?? new Set<Face>();
  shown.delete(area); shown.set(area, faces.add(face));   // to the back: asked last
  for (const old of shown.keys()) { if (shown.size <= MAX_SHOWN) break; shown.delete(old); }
}
/** hold an area for a face and arm the watch, as an ask for it does: the whole (systemsWhole.ts, #1193) holds the root */
export function holdArea(area: string, face: Face) { hold(area, face); if (!watching()) watchRecords(toHolders); }
/** a face left (wire.ts removeWorkFace): its areas go when nobody else shows them; the watch stops when none is shown */
export function dropFace(face: Face) {
  for (const [area, faces] of shown) { faces.delete(face); if (!faces.size) shown.delete(area); }
  if (!shown.size) stopWatch();
}
function stopWatch() { clearTimeout(timer); try { watcher?.close(); } catch { /* closed */ } watcher = null; watched = ""; }
/** watch the records folder; `tell` gets one message per shown area, at most every 150 ms however many files changed.
 *  The watch that fails lets go of itself, and the next face that asks arms it again */
export function watchRecords(tell: (m: Changed) => void, dir = recordsDir()): () => void {
  stopWatch();
  if (!existsSync(dir)) return () => {};
  let me: FSWatcher;
  try {
    me = watch(dir, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {   // the whole tick: nothing a record, a file or a face does may throw out of a timer and take the engine down
          nextTick();
          const { recs, bad } = readRegistry(dir);
          const views = [...shown.keys()].map((area) => ({ area, view: areaView(recs, area, bad) }));
          const facts = await factsFor(views.map((v) => v.view));
          for (const { area, view } of views) { try { tell({ type: "work.systems.changed", area, view, facts }); } catch { /* a face's trouble is never the watch's */ } }
        } catch { /* the next change tries again */ }
      }, 150);
    });
  } catch { return () => {}; }
  watcher = me; watched = dir;
  me.on("error", () => { if (watcher === me) stopWatch(); else try { me.close(); } catch { /* closed */ } });
  return () => { if (watcher === me) stopWatch(); };
}
/** whether the watch is armed on that folder (a test's, and the wire's) */
export const watching = (dir = recordsDir()) => !!watcher && watched === dir;
const toHolders = (m: Changed) => { for (const f of shown.get(m.area) ?? []) { try { f.send(m); } catch { /* that face is going */ } } };

/** the wire's questions (wire.ts), each answered to the face that asked, by rid. An ask for an area holds it for that
 *  face and (re)arms the watch: a face asks again when its socket comes back, and the watch comes back with it */
export async function systemsMsg(w: Face, m: { type: string; rid?: unknown; area?: unknown }) {
  const reply = (o: object) => w.send({ type: m.type, rid: m.rid, ...o });
  const area = typeof m.area === "string" && /^[a-z0-9/-]{1,120}$/.test(m.area) ? m.area : "";
  if (!area) return reply({ error: "the block names no area" });
  try {
    const { recs, bad } = readRegistry();
    if (!recs.has(area)) return reply({ error: `no system "${area}" in the registry` });
    if (m.type === "work.systems.area") {
      hold(area, w);
      if (!watching()) watchRecords(toHolders);   // the first face that shows an area starts the watch; nobody pays before
      const view = areaView(recs, area, bad);
      return reply({ view, facts: await factsFor([view]) });
    }
    return reply({ frames: await history(area) });
  } catch (err) { return reply({ error: err instanceof Error ? err.message.split("\n")[0] : String(err) }); }
}
