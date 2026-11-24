// What a place is (BR1 root part 2, #1615; mine/look/br1/strategy/root.html, model.md 3.2): the one source of a folder's
// name, its state, its one line and its counts. Every screen that says something about a folder reads placeOf: the
// folder's front, its tab opened and folded, its contents card, the sidebar's row, the move-in's place rows. A quiet
// session counts as much as a working one: it is inside the folder, so the folder is never "empty" while it holds one.
// Also the place's other rules, kept here so no screen has its own: which folders the plane draws after the move-in
// read (listed), and a path in one form (tilde).
// Signed: marcocyl04-ux's agent (builder E), BR1 root (#1615).
import { D, MODE, ancestors, asksInRegion, childrenOf, dataVer, open, piecesIn, regionOf, type Ask, type Piece, type Region } from "./cv/core.ts";
import type { Data } from "./cv/types.ts";
import { titleOf } from "./plane/layout.ts";
import { piecesOf, removePiece } from "./movein/data.ts";
import { rowOfFolder } from "./movein/state.ts";
import { knownInRegion } from "./movein/you/lens-state.ts";
import type { You } from "./movein/you/types.ts";
import type { Folder } from "./notes/read.ts";
import { youNow } from "./cv/wire/you.ts";
import { givenOf } from "./folder/head.ts";
import { nestByPath, solHome } from "./cv/wire/plane.ts";
import { QUIET } from "./form.ts";

/** active (anything in hand) → quiet (nothing in hand) → done (the person says so) → kept (out of view, all intact) */
export type PlaceState = "active" | "quiet" | "done" | "kept";
export type Counts = {
  /** what needs the person: each open ask in the folder, and each session waiting at its terminal or failed */
  asks: number;
  working: number;
  /** sessions at rest: idle, paused, stopped, taken back */
  quiet: number;
  /** sessions done or merged */
  done: number;
  /** everything in the folder, quiet and done things included */
  pieces: number;
  /** the files its pieces say they changed; no engine message gives them yet, so a live folder's is 0 */
  files: number;
};
/** `sessions`: the folder's one count of its sessions, the one every screen says (sessionsOf); `bare`, its line without
 *  the folders inside it, for a card too small for the whole line (form.ts folderSays); `count`, its line's first count
 *  in figures, what far says of it at rest ("38 sessions", countOf) */
export type Place = { id: string; name: string; state: PlaceState; line: string; bare: string; counts: Counts; empty: boolean; sessions: number; count: string };
/** where a session stands, for the counts */
export type Stand = "asks" | "working" | "quiet" | "done";

const RUNS = new Set(["session", "job", "starter"]);
const failing = (p: Piece) => p.state === "failed" || /\bfail|\bbroke/i.test(String(p.term?.stateWord || ""));
const merged = (p: Piece) => (p.copies || []).some((c) => c.state === "merged");

/** a run's stand: asked or waiting or failed → asks; done or merged → done; at rest → quiet; else at work */
export function standOf(p: Piece, asked: (id: string) => boolean): Stand {
  if (p.kind === "starter") return "working";
  if (p.term?.waiting || failing(p) || asked(p.id) || (p.parts || []).some((x) => asked(x.id))) return "asks";
  if (p.state === "done" || merged(p)) return "done";
  if (/idle|paused|stopped|taken back/.test(String(p.state))) return "quiet";
  return "working";
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const num = (n: number) => WORDS[n] ?? String(n);
const many = (n: number, one: string, more = one + "s") => `${num(n)} ${n === 1 ? one : more}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** a thing's kind as the line counts it */
const KIND: Record<string, [string, string]> = { session: ["session", "sessions"], job: ["session", "sessions"], starter: ["session", "sessions"], sticky: ["note", "notes"],
  doc: ["page", "pages"], page: ["page", "pages"], list: ["list", "lists"], copies: ["side copy list", "side copy lists"], row: ["automation", "automations"] };

/** the folder's counts, from its pieces and the open asks in it */
export function countsOf(ps: Piece[], asks: Ask[]): Counts {
  const asked = new Set<string>(), c: Counts = { asks: asks.length, working: 0, quiet: 0, done: 0, pieces: ps.length, files: 0 };
  for (const a of asks) { asked.add(a.piece); if (a.part) asked.add(a.part); }
  for (const p of ps) {
    c.files += +(p.files || 0) || 0;
    if (!RUNS.has(p.kind)) continue;
    const s = standOf(p, (id) => asked.has(id));
    if (s === "asks") { if (!asks.some((a) => a.piece === p.id || (p.parts || []).some((x) => x.id === a.part))) c.asks++; }   // its own ask is counted once
    else c[s]++;
  }
  return c;
}

/** a folder's sessions, the one count every screen says of it (BR1 hold 3, #1615): what the move-in read counted at its
 *  path, as the move-in's row says it, or the sessions drawn in it when they are more (one started since the read, a
 *  folder made in Sol). Its own, never its folders': each folder inside says its own, and the line names them as folders */
export const sessionsOf = (read: number, drawn: number) => Math.max(read > 0 ? read : 0, drawn);

/** what is in the folder, by kind, in words: "four sessions, two notes" (the two biggest kinds, then the rest); `n`,
 *  the folder's one count (sessionsOf), stands for its sessions */
function kinds(ps: Piece[], n = 0): [string, number][] {
  const by = new Map<string, number>();
  for (const p of ps) { if (RUNS.has(p.kind)) continue; const k = (KIND[p.kind] ?? ["thing", "things"]).join("|"); by.set(k, (by.get(k) ?? 0) + 1); }
  if (n > 0) by.set("session|sessions", n);
  return [...by].sort((a, b) => b[1] - a[1]);
}
function inside(ps: Piece[], n = 0): string {
  const ks = kinds(ps, n), top = ks.slice(0, 2).map(([k, n]) => { const [one, more] = k.split("|"); return many(n, one, more); });
  const rest = ks.slice(2).reduce((t, [, n]) => t + n, 0);
  return [...top, rest ? many(rest, "more thing", "more things") : ""].filter(Boolean).join(", ");
}
/** a quiet folder's count far off (BR1 words, #1615): its line's first count in figures, "38 sessions", "3 notes"; none, "" */
function countOf(ps: Piece[], n = 0): string {
  const [top] = kinds(ps, n);
  if (!top) return "";
  const [one, more] = top[0].split("|");
  return `${top[1]} ${top[1] === 1 ? one : more}`;
}

/** the state, from what the person said of the folder and what is in hand */
export function stateFrom(r: Region, c: Counts): PlaceState {
  return r.kept ? "kept" : r.done ? "done" : c.asks + c.working > 0 ? "active" : "quiet";
}

/** the folders in a folder, by name: "inside: Garden", "inside: Garden and Kids", "inside: Garden, Kids and 5 more"
 *  (BR1, orchestrator 07:32, #1615); a count alone when no names are given; "" for none */
export function insideOf(subs: number | string[]): string {
  const ns = Array.isArray(subs) ? subs : [];
  if (!ns.length) return typeof subs === "number" && subs ? many(subs, "folder") : "";
  return `inside: ${ns.length === 1 ? ns[0] : ns.length === 2 ? `${ns[0]} and ${ns[1]}` : `${ns[0]}, ${ns[1]} and ${ns.length - 2} more`}`;
}

export { QUIET };   // form.ts's: a quiet folder's word on its line, "Nothing running · 38 sessions"

/** the one line: "Three in hand, one needs you"; "Nothing running · four sessions, two notes"; "Done · …"; empty, "Nothing in it yet".
 *  `subs`, the folders sitting in it (BR1, folders in folders), by name: their notes and pages count as its own, and the
 *  line ends with their names ("Nothing running · two notes · inside: Garden", insideOf); a folder holding only folders says only
 *  them ("Inside: Garden and Kids"), never "Nothing".
 *  `n`, its one count of sessions (sessionsOf, BR1 hold 3): the line says that number of sessions and no other, so a
 *  folder whose sessions lie inside it, none drawn, reads "Nothing running · 38 sessions", never its name alone */
export function lineFrom(state: PlaceState, c: Counts, ps: Piece[], subs: number | string[] = 0, n = 0, known = true): string {
  const folders = insideOf(subs), tail = (t: string) => [t, folders].filter(Boolean).join(" · ");
  if (!c.pieces && !n) return folders ? cap(folders) : known ? "Nothing in it yet" : "Reading…";
  // the drawn sessions' done is said only while they are all of its sessions: else it is a second count (311 done of 495)
  const all = ps.filter((p) => RUNS.has(p.kind)).length >= n;
  if (state === "active") {
    const bits = [c.working ? `${num(c.working)} in hand` : "", c.asks ? `${num(c.asks)} need${c.asks === 1 ? "s" : ""} you` : "", c.done && all ? `${num(c.done)} done` : ""].filter(Boolean);
    return tail(cap(bits.join(", ")));
  }
  if (state === "quiet" && c.done === c.pieces && !folders && all) return cap(`${many(c.done, "session")} done`);
  const word = state === "quiet" ? QUIET : cap(state), what = inside(ps, n);
  return tail(what ? `${word} · ${what}` : word);   // nothing it can count: the word alone, never "Quiet · · inside: …"
}

/** a folder made without a name is named by what is in it, once something is: its first session's task, else its first
 *  note's first words (whole words, never cut) */
function nameFrom(r: Region, ps: Piece[]): string {
  if (r.named !== false || !ps.length) return String(r.name);
  const s = ps.find((p) => RUNS.has(p.kind)), t = ps.find((p) => p.text);
  return s ? titleOf(s) : t ? String(t.text).split(/\s+/).slice(0, 4).join(" ") : String(r.name);
}

/** the ask bar's words: the drawing's (bar-folder.html, frame.html; BR1 conform row 30, #1615), whole at every width; the
 *  person's own moves are said in Every move (sayToo), so the line is never cut mid-word ("put newsletter on th") */
export function askHint(_names: string[]): string {
  return "Ask, make, or change anything";
}
/** the Every-move list's spoken examples (BR1 words, #1615), on the person's own first folder (askHint's), never a fixed name */
export const sayToo = (first?: string): string =>
  `Say it too: ${["“next ask”", first ? `“go to ${first}”` : "", "“zoom out”", "“this is a lot”"].filter(Boolean).join(", ")}`;

/** the name a folder made without one starts with, until what is put in it names it (nameFrom): "Folder", "Folder 2" */
export function unnamed(taken: string[]): string {
  const has = new Set(taken.map((t) => t.toLowerCase()));
  let n = 1;
  while (has.has((n === 1 ? "folder" : `folder ${n}`))) n++;
  return n === 1 ? "Folder" : `Folder ${n}`;
}

/** a place, from its folder, its pieces and the open asks in it (pure: the tests give all three). With folders in it
 *  (BR1), `ps` and `asks` are the whole tree's and `subs` the folders directly in it; its name is read from its own things.
 *  `read`: the sessions the move-in read counted at its path, so a folder of 38 with none drawn is not empty; with the
 *  sessions drawn in it (its own, not its folders'), its one count (sessionsOf). `known`: the engine's sessions are heard
 *  (sessionsHeard); until then a folder with nothing drawn is not empty but not yet read, and says "Reading…" */
export function placeFrom(r: Region, ps: Piece[], asks: Ask[], subs: number | string[] = 0, read = 0, known = true): Place {
  const sessions = sessionsOf(read, ps.filter((p) => RUNS.has(p.kind) && p.region === r.id).length);
  const counts = countsOf(ps, asks), empty = known && !(Array.isArray(subs) ? subs.length : subs) && !sessions && Object.values(counts).every((n) => n === 0), state = stateFrom(r, counts);
  const line = lineFrom(state, counts, ps, subs, sessions, known), bare = counts.pieces || sessions ? lineFrom(state, counts, ps, 0, sessions) : line;
  return { id: r.id, name: nameFrom(r, ps.filter((p) => p.region === r.id)), state, line, bare, counts, empty, sessions, count: countOf(ps, sessions) };
}
/** an empty folder Sol knows something about says what it knows ("A repo · Has CLAUDE.md", two facts and how many more),
 *  never "Nothing in it yet" beside its badge's count (scope (e), try 5's my-sol, BR1 #1615); it stays empty (no session,
 *  nothing drawn), so its page still offers the first session. `facts`: what Sol knows there, as the badge counts it */
export function knowing(p: Place, facts: readonly string[]): Place {
  if (!p.empty || !facts.length) return p;
  const line = facts.slice(0, 2).join(" · ") + (facts.length > 2 ? ` · ${facts.length - 2} more` : "");
  return { ...p, line, bare: line };
}

/** the engine's sessions, heard since the face attached (cv/wire/plane.ts, on its first work.sessions): right after the
 *  engine starts every folder is drawn before its sessions are loaded, and "Nothing in it yet" there was false (BR1 hold,
 *  scope 09:48, #1615). The fixture always knows its own */
let heard = false;
let kept: { dv: number; d: typeof D; y: You | null; m: Map<string, Place> } | null = null;
export const sessionsHeard = (yes = true) => { if (heard !== yes) { heard = yes; kept = null; } };
/** when the face attached (cv/wire/plane.ts): "Opening your canvas…" gives up after OPENING_MS, so an engine that never
 *  sends its sessions leaves an empty canvas, never a wait that lasts for good */
let attachedAt = 0;
export const OPENING_MS = 20_000;
export const canvasAttached = (at = Date.now()) => { attachedAt = at; };
/** the canvas is still opening: live, nothing on it yet and the engine's sessions not heard (#1761: the canvas stood
 *  empty 6 s and more before the Diary and the folders came, BR1 lane G); the dev page's ?opening=1 holds it (stills) */
const holdOpening = typeof location !== "undefined" && new URLSearchParams(location.search).get("opening") === "1";
export const canvasOpening = () => holdOpening || (MODE === "live" && !heard && !D.regions.length && Date.now() - attachedAt < OPENING_MS);   // a folder drawn already is the canvas, not a wait
/** what a session started in a folder is given (folder/head.ts givenOf), of next.you, the folder's own facts and the read:
 *  what an empty folder's card says it knows, never the person's share of time (BR1 conform #21, walk 3) */
const factsIn = (id: string): string[] => {
  const folder = (D.notes as { folders?: Record<string, Folder> } | undefined)?.folders?.[id], found = rowOfFolder(id)?.found;
  const regions = D.regions.map((r) => ({ id: r.id, name: r.name, ...(typeof r.path === "string" ? { path: r.path } : {}) }));
  return givenOf(knownInRegion(id, regions, { you: youNow(), ...(folder ? { folders: { [id]: folder } } : {}), ...(found ? { found: [found] } : {}) })).map((k) => k.fact);
};

/** what a place is now: its name, state, line and counts; asked per folder per draw, kept per version of the data and of
 *  what Sol knows (next.you) */
export function placeOf(id: string): Place {
  if (!kept || kept.dv !== dataVer() || kept.d !== D || kept.y !== youNow()) kept = { dv: dataVer(), d: D, y: youNow(), m: new Map() };
  const had = kept.m.get(id);
  if (had) return had;
  const r = regionOf(id) ?? { id, name: id.replace(/^[wh]:/, "").split("/").filter(Boolean).pop() || id, kind: "code" as const };
  // the folder and every folder in it, as deep as they go (parentOf breaks a loop, so the walk ends)
  const tree = [id];
  for (let i = 0; i < tree.length; i++) for (const c of childrenOf(tree[i])) if (!tree.includes(c)) tree.push(c);
  const ps = tree.flatMap((t) => piecesIn(t)), a = tree.flatMap((t) => asksInRegion(t));
  kept.m.set(id, { id, name: String(r.name), state: "quiet", line: "", bare: "", counts: countsOf([], []), empty: true, sessions: 0, count: "" });   // a loop asks itself back: its name, once
  const p0 = placeFrom(r, ps, a, childrenOf(id).map((c) => placeOf(c).name), rowOfFolder(id)?.sessions ?? 0, MODE === "fixture" || heard);
  const p = p0.empty ? knowing(p0, factsIn(id)) : p0;
  kept.m.set(id, p);
  return p;
}

/** the calm screen (BR1 item 3, #1615): two folders with one name are told apart by the nearest parent that differs, drawn
 *  in grey after the name wherever it is drawn (the sidebar's row, the folder's front and tab). A folder's parents, nearest
 *  first: the folders it sits in, then its path's folders (w:/code/a/api → a, code; h:house/kids → house). Of a group
 *  of same-named folders, each shows the first parent no other one shares there; none when its parents run out (a folder
 *  with no path and no folder around it) */
export function apartFrom(fs: { id: string; name: string; up: string[] }[]): Map<string, string> {
  const out = new Map<string, string>(), by = new Map<string, typeof fs>();
  for (const f of fs) { const k = f.name.trim().toLowerCase(); by.set(k, [...(by.get(k) ?? []), f]); }
  for (const g of by.values()) {
    if (g.length < 2) continue;
    for (const f of g) {
      const others = g.filter((o) => o !== f);
      let i = f.up.findIndex((u, n) => others.every((o) => o.up[n]?.toLowerCase() !== u.toLowerCase()));
      if (i < 0) i = f.up.findIndex((u, n) => others.some((o) => o.up[n]?.toLowerCase() !== u.toLowerCase()));
      if (i >= 0) out.set(f.id, f.up[i]);
    }
  }
  return out;
}
const pathUp = (id: string) => id.replace(/^[wh]:/, "").split("/").filter(Boolean).slice(0, -1).reverse();
let apartKept: { dv: number; d: typeof D; m: Map<string, string> } | null = null;
/** the grey parent a folder's name carries, or null when no other folder has its name */
export function apartOf(id: string): string | null {
  if (!apartKept || apartKept.dv !== dataVer() || apartKept.d !== D) {
    const fs = (D?.regions ?? []).map((r) => ({ id: r.id, name: placeOf(r.id).name, up: [...ancestors(r.id).map((a) => placeOf(a).name), ...pathUp(r.id)] }));
    apartKept = { dv: dataVer(), d: D, m: apartFrom(fs) };
  }
  return apartKept.m.get(id) ?? null;
}

/** an opened folder's path (H3, BR1 #1615): every folder it sits in, outermost first, then itself, each by its name
 *  ("sol", "home": the crumb reads "All folders / sol / home"); a folder that is gone, nothing */
export function folderPath(id: string): { id: string; name: string }[] {
  if (!regionOf(id)) return [];
  return [...ancestors(id).reverse(), id].map((f) => ({ id: f, name: String(regionOf(f)!.name) }));
}

/** the things in a folder, what needs the person first, then at work, done, at rest, then the rest (the contents card) */
export function ranked(id: string): Piece[] {
  const asked = new Set(open().flatMap((a) => [a.piece, a.part ?? ""]));
  const at = (p: Piece) => (RUNS.has(p.kind) ? ["asks", "working", "done", "quiet"].indexOf(standOf(p, (x) => asked.has(x))) : 4);
  return piecesIn(id).filter((p) => !p.inside).sort((a, b) => at(a) - at(b));
}

/** which folders the plane draws, after the move-in read (#1758): a work folder the read did not list (a side copy, Sol's
 *  own wake folder, a scratch folder a session ran in) is not drawn, its sessions with it, unless this face added it
 *  (added) or a session in it started after the read (since: the person's own, never hidden); a Sol home folder it listed
 *  and home.places did not give (an empty one) is drawn. A folder the person kept (movein.json's keep) is always drawn,
 *  even when this read did not list it (no session of it on this Mac yet), so it is never only in the sidebar (BR1).
 *  Once the engine's tree has come (next.state's `folders`, engine next/tree.ts, #1816) it is the folders drawn, with
 *  their parents: a folder another message drew under another id is that one folder (oneTree), and a folder kept but
 *  no longer on the disk is not drawn. Nothing is deleted anywhere: what is not drawn stays on disk */
export function listed(d: Data, rows: { id: string; n: string; z?: string; path?: string; copyOf?: string }[], o: { kept: string[]; added: string[]; at: number; movedAt?: number; folders?: KeptFolder[]; words?: boolean; unsorted?: Map<string, Unsorted> }): void {
  const said = new Map((o.folders ?? []).map((f) => [f.id, f])), tree = said.size > 0;
  const kept = (tree ? [...said.keys()] : [...new Set(o.kept)]).filter((id) => id.startsWith("w:") || id.startsWith("h:"));
  // first, so a session in a folder the person keeps moves in before the read's rule. Once the person has said how their
  // folders are (#1816 round 2, engine next/said.ts) the tree is all that is drawn: every other folder waits in "Not
  // sorted yet" (o.unsorted), the sidebar's, and nothing Sol finds is added
  if (tree) oneTree(d, o.folders!, o.words ? o.unsorted ?? new Map() : undefined);
  if (o.unsorted) for (const id of said.keys()) o.unsorted.delete(id);
  // the read's rows, or the engine's one list alone (a reload hears next.state before the read): a folder of work.sessions
  // in neither is not drawn (BR1 hold 1: before, it stayed until the read came, and its nests were said)
  if (rows.length || said.size) {
    // under the tree a folder it does not hold is drawn only when added here or worked in since the move-in, never
    // because a read listed it (#1816: a folder gone from the disk, a side copy)
    const ids = new Set([...(tree ? [] : rows.map((r) => r.id)), ...kept]), added = new Set(o.added.map((x) => "w:" + x));
    const from = tree && o.movedAt ? o.movedAt : o.at;
    const since = (rid: string) => piecesOf(d, rid).some((id) => Number(d.pieces[id].born ?? 0) > from);
    for (const r of d.regions.filter((x) => x.from === "work" && !ids.has(x.id) && !added.has(x.id) && !since(x.id))) {
      for (const id of piecesOf(d, r.id)) removePiece(d, id);
      d.regions = d.regions.filter((x) => x !== r);
    }
    if (!tree) for (const r of rows) if (r.id.startsWith("h:") && !d.regions.some((x) => x.id === r.id))
      d.regions.push({ id: r.id, name: r.n, kind: r.z === "Build" ? "code" : "life", from: "places", ...(r.path ? { path: r.path } : {}) });
  }
  // every folder kept is drawn: one the read lists with no session in it (no region of work.sessions) as much as one
  // it does not list, and before the read answers (a reload hears next.state first)
  for (const id of kept) if (!d.regions.some((x) => x.id === id)) {
    const r = rows.find((x) => x.id === id), f = said.get(id), w = id.startsWith("w:"), rest = id.slice(2);
    const path = f?.path ?? r?.path ?? (w ? rest : undefined);
    d.regions.push({ id, name: f?.name ?? r?.n ?? (rest.split("/").filter(Boolean).pop() || rest), kind: r ? (r.z === "Build" || (!r.z && w) ? "code" : "life") : w ? "code" : "life", from: w ? "work" : "places", ...(path ? { path } : {}) });
  }
  // each folder drawn sits in the nearest drawn folder its path lies in, by rule, whether or not a session drew it (BR1
  // hold 1: one the list alone drew stood at the top); a rule's parent no longer drawn is let go; the person's stay theirs
  const drawn = new Set(d.regions.map((r) => r.id)), held = (r: Region) => !!r.parent && (r.parentBy === "person" || drawn.has(r.parent));
  const anew = (r: Region) => tree && said.has(r.id) && r.parentBy !== "person";   // the tree's: nested afresh
  const loose = d.regions.map((r) => { if ((held(r) && !anew(r)) || !r.parent) return r; const { parent: _p, parentBy: _b, ...rest } = r; return rest as Region; });
  const byPath = nestByPath(loose);
  // a folder of the tree sits where the tree puts it (the disk's nearest folder of it); the rest by their paths
  d.regions = d.regions.map((r, i) => {
    const f = anew(r) ? said.get(r.id) : undefined;
    if (!f?.parent) return held(r) && !anew(r) ? r : byPath[i];
    const { parent: _p, parentBy: _b, ...rest } = r;
    return (f.parent && drawn.has(f.parent) ? { ...rest, parent: f.parent, parentBy: "rule" } : rest) as Region;
  });
  // another checkout of a repo drawn here stands inside the repo's folder as a copy, by rule (BR1 order 4e); where the
  // person put a folder stays theirs (layout.ts applyNest)
  for (const r of rows) {
    const g = r.copyOf ? d.regions.find((x) => x.id === r.id) : undefined;
    if (g && g.parentBy !== "person" && d.regions.some((x) => x.id === r.copyOf)) { g.parent = r.copyOf; g.parentBy = "rule"; g.copy = true; }
  }
}
/** a folder of the engine's tree (next.state's `folders`, engine next/tree.ts): one the person keeps, or with `by: "disk"`
 *  a folder the disk has that holds two of theirs (drawn, never kept); `parent` the tree's folder it sits in */
export type KeptFolder = { id: string; name: string; path?: string; real?: string; parent?: string; by?: "disk"; also?: string[] };
/** a folder the person's words left out (#1816 round 2): its name, its path, how many sessions ran in it */
export type Unsorted = { id: string; name: string; path: string; sessions: number };

const trimmed = (p: string) => p.replace(/\/+$/, "");
/** a region's folder on disk: its path, or a session's folder its id names */
const pathOf = (r: Region) => trimmed(typeof r.path === "string" ? r.path : r.from === "work" && r.id.startsWith("w:") ? r.id.slice(2) : "");
/** one folder, one region (#1816): the tree is what is drawn. A folder another message drew under another id
 *  (home.places' id, a session's folder) is the tree's folder of that path, its pieces moved in; a session's folder
 *  inside a folder the person keeps is that folder; a folder of Sol's home the tree does not hold is Sol's own, not
 *  drawn, nor is Sol's home itself. A folder outside every one of the tree's, or in one only the disk added, stays as
 *  it is (the read's rule above has said whether it is drawn); so does a folder with no place on disk (the person's
 *  Things') */
function oneTree(d: Data, folders: readonly KeptFolder[], left?: Map<string, Unsorted>): void {
  const ids = new Set(folders.map((f) => f.id)), home = solHome();
  // by its path, by where a link to it leads (a session there is in it), and by a link inside it to a folder elsewhere
  // (`also`, the person's words only: Sol's home's copy of a class is that class)
  const at = folders.flatMap((f) => [f.path, f.real, ...(f.also ?? [])].filter((p): p is string => !!p).map((p) => ({ f, p: trimmed(p) })));
  const into = (r: Region): string | null | undefined => {
    const p = pathOf(r);
    if (ids.has(r.id) || !p) return undefined;
    // in a dot folder or an app's storage (Sol's own wake folders among them), never the person's
    // (below a folder of the person's, a dot folder is still theirs: a Claude Code worktree in Sol/sol/.claude/worktrees)
    const mine = at.filter((x) => p.startsWith(x.p + "/")).sort((a, b) => b.p.length - a.p.length)[0];
    if (/^\/(?:Users|home)\/[^/]+\/(?:Library|AppData)(?:\/|$)/.test(p) || (/[\\/]\./.test(p) && !(left && mine))) return null;
    const same = at.find((x) => x.p === p);
    if (same) return same.f.id;
    if (left) {   // the person's words: in the nearest of theirs, else not sorted yet
      const near = at.filter((x) => p.startsWith(x.p + "/")).sort((a, b) => b.p.length - a.p.length)[0]?.f;
      if (near) return near.id;
      const solsOwn = !!home && (p === home || (p.startsWith(home + "/") && !r.id.startsWith("h:")));   // Sol's home, its agents' runs
      if (!solsOwn) left.set(r.id, { id: r.id, name: r.name, path: p, sessions: piecesOf(d, r.id).filter((id) => d.pieces[id].kind === "session").length });
      return null;
    }
    const inSol = !!home && (p === home || p.startsWith(home + "/"));
    const holder = at.filter((x) => p.startsWith(x.p + "/") && (!inSol || x.f.id.startsWith("h:"))).sort((a, b) => b.p.length - a.p.length)[0]?.f;
    if (inSol) return !holder ? null : r.from === "work" ? holder.id : undefined;
    return r.from === "work" && holder && !holder.by ? holder.id : undefined;
  };
  for (const r of [...d.regions]) {
    const to = into(r);
    if (to === undefined) continue;
    for (const id of piecesOf(d, r.id)) { if (to) d.pieces[id].region = to; else removePiece(d, id); }
    d.regions = d.regions.filter((x) => x !== r);
  }
  for (const f of folders) {
    const r = d.regions.find((x) => x.id === f.id);
    if (r) { r.name = f.name; if (f.path) r.path = f.path; }
  }
}

/** the person's home folder, as the move-in read says it: an app project's label is its path with the home as "~"
 *  (carry-apps.ts); without one, a path's first two parts when they are /Users/<name> or /home/<name> */
export function homeDirOf(places: { path: string; label?: string }[]): string | null {
  for (const p of places) if (p.label?.startsWith("~/") && p.path.endsWith(p.label.slice(1))) return p.path.slice(0, p.path.length - p.label.length + 1);
  for (const p of places) { const m = /^\/(?:Users|home)\/[^/]+(?=\/|$)/.exec(p.path); if (m) return m[0]; }
  return null;
}
/** a path in one form everywhere (#1757): under the home, "~/…" */
export const tilde = (path: string, home: string | null) => (home && (path === home || path.startsWith(home + "/")) ? "~" + path.slice(home.length) : path);

/** a folder's name as a line of words says it, without its "(repo)": the plane's folder by its id, else `or` for one it
 *  does not draw (the id itself unless said; "" where the screen then says nothing). One lookup for the Scope's,
 *  the fits' and the lead's words (builder K, BR1 #1615) */
export const folderName = (rid: string | null | undefined, or = rid ?? ""): string => ((rid ? regionOf(rid)?.name : undefined) || or).replace(/ \(.*\)$/, "");
