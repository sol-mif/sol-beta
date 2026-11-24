// Where the move-in puts each folder (BR1 item 7, #1615; mine/look/br1/three.html "Proposes nested folders", strategic.html
// "Judging with no answer key", "The shelf · move-in Back"). Sol judges each folder from how the person lived in it, ranked
// against their own home, never against a list or a name:
//   came back  the days its files were changed on          recent  when it was last changed (or last worked in)
//   grew       its files changed after its first day       belongs what ties it to the person: a history kept (.git),
//              rules for AIs, sessions, stickies, things, an agent, added to Sol or put in the side by hand, a folder in it
// A folder used on one day only, tied to nothing, older than a week and than half of this home's folders, and quieter
// than three in four of them goes on the shelf:
// nothing is deleted, it waits there with its count, and one that comes alive again is proposed back. A home of fewer
// than MIN_HOME folders gives no spread to rank against, so every folder stays on the canvas.
// A parent is only ever where the disk says it: the folder it sits inside, or the folder whose rules file (CLAUDE.md,
// AGENTS.md) two or more of them read. Every placement of one move-in shares one batch id (Placed.batch, the field E's
// Undo takes), so one Back takes the whole move-in out, until the person's first own change; after that it is "Read
// again" (next.movein.read), never a reset. Each placement is a placed:<folder> line in what Sol knows (you-known.ts
// place), its reading ("one-day", "inside", "rules", "tries", "shape") what "same for these?" goes by.
// C-2 (movein-group.ts): each folder says who made it (made: you or your AI), and after the disk's parents and the shelf
// the quick tries an AI left and the folders the person's words name with one shape go into a suggested group, a parent
// that is new (fresh): its folder is made in Sol's home when the person moves in, and taken out again with the move-in's Back.
//   judge(read, r, { now, stop })           read only (carry.ts's Reader): every place judged, its parent and shelf
//   keepPlaces(w, judged, keep, now)        the kept folders placed, one batch → { batch, placed }
//   backMoveIn(w, batch, now)               the batch's placements out, one fix line; refused once the person changed something
//   shelfNow(w, home, r, now) · shelfPut(w, {folder, name}) · shelfTake(w, {folder})   the shelf: what is on it, what woke
// Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { randomBytes } from "node:crypto";
import { mkdirSync, rmdirSync, statSync } from "node:fs";
import { basename, dirname, join, sep } from "node:path";
import { fsReader, type MoveIn, type Place, type Reader } from "./carry.js";
import { EVERYWHERE, noteFix as fixLine, ownSince, place, readStore, unplace, type Placed } from "./you-known.js";
import type { Where } from "./you.js";
import { groupsOf, madeOf, type Group, type Made } from "./movein-group.js";

/** a shelf or move-in fix as one scoped line (#1615): hiding or bringing back a folder holds there, because of its
 *  placement (placed:<folder>); the move-in's one Back holds everywhere, because of the batch it takes back */
const noteFix = (w: Where, a: { how: "back" | "hide" | "show"; what: string; place?: string; batch?: string }, now: number) =>
  fixLine(w, { ...a, place: a.place ?? EVERYWHERE, reason: a.place ? `placed:${a.place}` : `movein:${a.batch}` }, now);

export const MIN_HOME = 8;
const FILES = 300, DAY = 86_400_000, UP = 6;
const RULES = ["CLAUDE.md", "AGENTS.md"];

/** first: its oldest file's time (ms), 0 with none */
export type Lived = { days: number; last: number; grew: number; belongs: string[]; first: number };
type OnDisk = { folder: string; name: string; path: string; reading: "inside" | "rules"; file?: string };
export type Parent = OnDisk | Group;
export type Judged = { folder: string; name: string; path: string; lived: Lived; score: number; shelf: boolean; parent: Parent | null; why: string | null; reading: string | null; made: Made };

/** a place's id on the plane: "h:<id>" for the Sol home's, "w:<path>" for every other (the face's rowId) */
export const folderOf = (p: Pick<Place, "id" | "path" | "from">) => (p.from === "home" ? "h:" + p.id : "w:" + p.path);
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const inside = (a: string, b: string) => a !== b && a.startsWith(b.endsWith(sep) ? b : b + sep);

/** how the person lived in one folder: its files' change times (two deep, at most FILES), its sessions, its ties */
export function livedOf(r: Reader, p: Place, order: readonly string[], now: number): Lived {
  const times: number[] = [];
  const take = (dir: string, depth: number) => {
    for (const d of r.list(dir) ?? []) {
      if (times.length >= FILES) return;
      if (d.name.startsWith(".") || d.name === "node_modules") continue;
      const q = join(dir, d.name);
      if (d.dir) { if (depth < 1) take(q, depth + 1); continue; }
      const t = r.time(q);
      if (t !== null && t <= now + DAY) times.push(t);
    }
  };
  take(p.path, 0);
  const first = times.length ? Math.min(...times) : 0;
  const last = Math.max(0, p.last ?? 0, ...times);
  const n = Object.values(p.sessions ?? {}).reduce((a: number, b) => a + (b ?? 0), 0);
  const belongs = [
    p.holds.repo ? "it keeps a history of its changes" : "",
    p.rules?.length ? `it has ${p.rules.join(" and ")} for AIs` : "",
    n ? `${plural(n, "session")} worked in it` : "",
    p.holds.stickies ? "it has stickies" : "",
    p.holds.things ? "it has things to do" : "",
    p.holds.agent ? "an agent works in it" : "",
    p.from === "work" ? "you added it to Sol" : "",
    order.includes(p.id) || order.includes(p.path) ? "you put it in your side" : "",
    p.said?.length ? `you wrote “${p.said[0]}”` : "",
  ].filter(Boolean);
  return { days: new Set(times.map(dayOf)).size, last, grew: times.filter((t) => t - first > DAY).length, belongs, first };
}

/** where each value stands among the home's own: 0 the lowest, 1 the highest, ties sharing their middle */
function standing(xs: number[]): number[] {
  const sorted = [...xs].sort((a, b) => a - b), n = xs.length;
  if (n < 2) return xs.map(() => 0.5);
  return xs.map((x) => { const lo = sorted.indexOf(x), hi = sorted.lastIndexOf(x); return (lo + hi) / 2 / (n - 1); });
}

/** the nearest folder above `path` holding a rules file, below every stop (the person's home, the disk's root) */
function rulesAbove(r: Reader, path: string, stop: readonly string[]): { dir: string; file: string } | null {
  let dir = dirname(path);
  for (let i = 0; i < UP && dir !== dirname(dir) && !stop.includes(dir) && !stop.some((s) => inside(s, dir)); i++, dir = dirname(dir)) {
    const names = r.list(dir) ?? [];
    const file = RULES.find((f) => names.some((x) => !x.dir && x.name === f));
    if (file) return { dir, file };
  }
  return null;
}

/** BR1 first-timer P 3 (#1615): a place that holds everything is never a folder and never a parent: the person's home,
 *  Sol's own home (SOL_HOME), an app's storage (~/Library, ~/AppData, a dot folder in the home) and a sync root (iCloud
 *  Drive, Dropbox, Google Drive, OneDrive). `homes` are the person's home and SOL_HOME */
export function holdsAll(path: string, homes: readonly string[]): boolean {
  const p = path.replace(/[\\/]+$/, ""), hs = homes.map((h) => h.replace(/[\\/]+$/, "")).filter(Boolean);
  if (!p || p === "/" || hs.includes(p) || hs.some((h) => inside(h, p))) return true;
  for (const h of hs) if (inside(p, h)) {
    const rest = p.slice(h.length + 1);
    if (/^(Library|AppData|\.[^/\\]+)([/\\]|$)/.test(rest) || /^(Dropbox|Google Drive|OneDrive[^/\\]*|iCloud Drive|Box)$/.test(rest)) return true;
  }
  return false;
}
/** the read's places that are folders: none that holds everything (holdsAll), nor one carry nested in such a place */
export function foldersOf<R extends Pick<MoveIn, "places">>(read: R, homes: readonly string[]): R {
  const out = new Set(read.places.filter((p) => p.from !== "home" && holdsAll(p.path, homes)).map((p) => p.id));
  return { ...read, places: read.places.filter((p) => !out.has(p.id)).map((p) => (p.parent && out.has(p.parent) ? (({ parent: _, ...q }) => q)(p) : p)) };
}

/** every place of the move-in's read judged (read only): its parent by the disk, then the shelf by standing */
export function judge(read: Pick<MoveIn, "places" | "order">, r: Reader = fsReader, o: { now?: number; stop?: string[] } = {}): Judged[] {
  const now = o.now ?? Date.now(), stop = o.stop ?? [], places = foldersOf(read, stop).places;
  const lived = places.map((p) => livedOf(r, p, read.order, now));
  const parents: (OnDisk | null)[] = places.map(() => null);
  const byId = new Map(places.map((p) => [p.id, p]));
  // inside: the place carry nested it in, else the nearest place whose folder holds it on disk; the person's home (a
  // session opened there) or anything above it holds everything, so it is never a parent
  const wide = (path: string) => stop.includes(path) || stop.some((s) => inside(s, path));
  places.forEach((p, i) => {
    const up = p.parent ? byId.get(p.parent) : places.filter((q) => inside(p.path, q.path) && !wide(q.path)).sort((a, b) => b.path.length - a.path.length)[0];
    if (up) parents[i] = { folder: folderOf(up), name: up.name, path: up.path, reading: "inside" };
  });
  // rules: two or more places with no parent reading the same rules file above them; the folder holding it is their parent
  const shared = new Map<string, { file: string; is: number[] }>();
  places.forEach((p, i) => {
    if (parents[i]) return;
    const a = rulesAbove(r, p.path, stop);
    if (a) shared.set(a.dir, { file: a.file, is: [...(shared.get(a.dir)?.is ?? []), i] });
  });
  for (const [dir, { file, is }] of shared) if (is.length >= 2) for (const i of is) parents[i] = { folder: "w:" + dir, name: basename(dir), path: dir, reading: "rules", file };
  // a folder holding another belongs too
  parents.forEach((up, i) => { if (!up) return; const j = places.findIndex((q) => folderOf(q) === up.folder); if (j >= 0 && !lived[j].belongs.some((b) => b.startsWith("it holds"))) lived[j].belongs.push(`it holds ${places[i].name}`); });

  const top = places.map((_, i) => i).filter((i) => !parents[i]);
  const s = { days: standing(top.map((i) => lived[i].days)), last: standing(top.map((i) => lived[i].last)), grew: standing(top.map((i) => lived[i].grew)) };
  const score = new Map(top.map((i, k) => [i, (s.days[k] + s.last[k] + s.grew[k]) / 3]));
  // a folder changed this week has had no time to be come back to: only one older than a week and than half of this
  // home's folders is one-time (a home made in a few days shelves nothing)
  const old = new Set(top.filter((i, k) => s.last[k] < 0.5 && now - lived[i].last > 7 * DAY));
  const scores = [...score.values()].sort((a, b) => a - b), quarter = scores[Math.floor((scores.length - 1) / 4)] ?? 0;
  const out: Judged[] = places.map((p, i) => {
    const l = lived[i], up = parents[i], sc = score.get(i) ?? 0;
    const shelf = !up && top.length >= MIN_HOME && !l.belongs.length && l.days <= 1 && sc <= quarter && old.has(i);
    const why = up ? (up.reading === "inside" ? `it sits inside ${up.name} on disk` : `it reads ${up.file} in ${up.name}, as ${plural(shared.get(up.path)!.is.length - 1, "other folder")} there ${shared.get(up.path)!.is.length === 2 ? "does" : "do"}`)
      : shelf ? `it was changed on one day only${l.last ? `, ${dayOf(l.last)}` : ""}, and three in four of your folders were used more` : null;
    return { folder: folderOf(p), name: p.name, path: p.path, lived: l, score: Math.round(sc * 100) / 100, shelf, parent: up, why, reading: up ? up.reading : shelf ? "one-day" : null, made: madeOf(p, l.first) };
  });
  // C-2: the suggested groups, after the disk's parents and the shelf, so they change no standing
  groupsOf(places, out, r, read.order).forEach((g, i) => {
    if (g) Object.assign(out[i], { parent: g, reading: g.reading, why: g.reading === "tries" ? "your AIs made it in a quick try, and nothing else of yours uses it" : `you called them “${g.said}”, and they hold the same shape${g.shape?.length ? `: ${g.shape.join(", ")}` : ""}` });
  });
  return out;
}

/** a suggested group's folder, made in Sol's home as the person moves in (it exists only from then on) */
const makeGroup = (w: Where, g: Parent) => { if ("fresh" in g && g.fresh) try { mkdirSync(join(w.sol, g.name), { recursive: true }); } catch { /* the placement stands without it */ } };

/** the kept folders placed, every line of this move-in under one batch id: under its parent, or on the shelf. A folder
 *  the person removed at the move-in goes on the shelf too, as theirs (BR1 first-timer P 4: one home for a folder put
 *  away, the Diary points to it), once: one on the shelf already stays as it is */
export function keepPlaces(w: Where, judged: readonly Judged[], keep: readonly string[], now = Date.now(), drop: readonly string[] = [], o: { apart?: readonly string[]; into?: Readonly<Record<string, string>> } = {}) {
  const batch = `movein-${randomBytes(6).toString("base64url")}`, kept = new Set(keep), out = new Set(drop), placed: Placed[] = [];
  // the migration's answers (migration.html C): a move the person changed back leaves its folders where they are; a
  // folder Sol left to them and they folded into another goes inside it, as theirs
  const apart = new Set(o.apart ?? []), into = Object.entries(o.into ?? {}).filter(([f, to]) => /^[wh]:./.test(f) && /^[wh]:./.test(to) && f !== to && !out.has(f));
  for (const j of judged) {
    if (out.has(j.folder) || apart.has(j.folder) || into.some(([f]) => f === j.folder) || !j.why || !j.reading || !(kept.has(j.folder) || (j.parent && kept.has(j.parent.folder)))) continue;
    if (j.parent) makeGroup(w, j.parent);
    const r = place(w, { folder: j.folder, name: j.name, to: j.parent ? j.parent.folder : "shelf", why: j.why, reading: j.reading, batch }, now);
    if (r.ok) placed.push(r.placed);
  }
  for (const [f, to] of into) {
    const name = judged.find((j) => j.folder === f)?.name ?? basename(f.slice(2)), toName = judged.find((j) => j.folder === to)?.name ?? basename(to.slice(2));
    const r = place(w, { folder: f, name, to, why: `you folded it into ${toName} when moving in`, reading: "you", batch, by: "person" }, now);
    if (r.ok) placed.push(r.placed);
  }
  const shelved = new Set(readStore(w.sol).placed.filter((p) => p.to === "shelf").map((p) => p.folder));
  for (const id of out) {
    if (!/^[wh]:./.test(id) || shelved.has(id)) continue;
    const name = judged.find((j) => j.folder === id)?.name ?? basename(id.slice(2));
    const r = place(w, { folder: id, name, to: "shelf", why: "you removed it when moving in", reading: "you", batch, by: "person" }, now);
    if (r.ok) placed.push(r.placed);
  }
  return { batch, placed };
}

/** one Back for the whole move-in: every placement of the batch out, and one fix line; once the person has changed
 *  something of their own since, a whole Back would undo it too, so it is refused and Read again is offered */
export function backMoveIn(w: Where, a: { batch?: unknown }, now = Date.now()) {
  const batch = typeof a.batch === "string" ? a.batch : "";
  const lines = readStore(w.sol).placed.filter((p) => p.batch === batch);
  if (!batch || !lines.length) return { ok: false as const, why: "no move-in of that batch is placed" };
  const at = lines.map((p) => p.at).sort()[0];
  if (ownSince(w, at, batch)) return { ok: false as const, why: "you have changed things yourself since the move-in, so it is read again instead", again: true };
  const out = unplace(w, { batch });
  // a suggested group's folder this move-in made goes again, while it is empty (C-2)
  for (const g of new Set(out.filter((p) => (p.reading === "tries" || p.reading === "shape") && p.to.startsWith("h:")).map((p) => join(w.sol, p.to.slice(2)))))
    try { if (statSync(g).birthtimeMs >= Date.parse(at) - 60_000) rmdirSync(g); } catch { /* not empty, or not there */ }
  noteFix(w, { how: "back", what: `the move-in's ${plural(out.length, "placement")}`, batch }, now);
  return { ok: true as const, batch, undone: out.map((p) => p.folder) };
}

const pathOf = (home: string, folder: string) => (folder.startsWith("w:") ? folder.slice(2) : folder.startsWith("h:") ? join(home, folder.slice(2)) : folder);

/** the shelf: every folder on it, Sol's and the person's, newest first, with its count; one changed since it went there
 *  is awake (proposed back) */
export function shelfNow(w: Where, home: string, r: Reader = fsReader, now = Date.now()) {
  const on = readStore(w.sol).placed.filter((p) => p.to === "shelf").sort((a, b) => (a.at < b.at ? 1 : -1));
  const shelf = on.map((p) => {
    const path = pathOf(home, p.folder), t = livedOf(r, { id: p.folder, name: p.name, path, from: "work", kind: null, holds: { repo: false, stickies: 0, things: 0, agent: false } }, [], now).last;
    return { folder: p.folder, name: p.name, by: p.by ?? "sol", why: p.why, at: p.at, ...(p.batch ? { batch: p.batch } : {}), ...(t > Date.parse(p.at) ? { awake: true as const } : {}) };
  });
  return { ok: true as const, shelf, n: shelf.length, awake: shelf.filter((x) => x.awake).map((x) => x.folder) };
}
/** the person sends a folder to the shelf (hiding it): their own line, Sol never moves it back by itself */
export function shelfPut(w: Where, a: { folder?: unknown; name?: unknown }, now = Date.now()) {
  const folder = typeof a.folder === "string" ? a.folder.slice(0, 1000) : "";
  if (!folder) return { ok: false as const, why: "folder is the one to archive" };
  const name = typeof a.name === "string" && a.name ? a.name.slice(0, 200) : basename(folder.replace(/^[wh]:/, ""));
  const r = place(w, { folder, name, to: "shelf", why: "you put it there", reading: "you", by: "person" }, now);
  if (!r.ok) return r;
  noteFix(w, { how: "hide", what: `${name} in Archived`, place: folder }, now);
  return { ok: true as const, folder };
}
/** a folder off the shelf, back on the canvas where it was: its line out, and a fix line saying so */
export function shelfTake(w: Where, a: { folder?: unknown }, now = Date.now()) {
  const folder = typeof a.folder === "string" ? a.folder : "";
  const on = readStore(w.sol).placed.find((p) => p.folder === folder && p.to === "shelf");
  if (!on) return { ok: false as const, why: "that folder is not archived" };
  unplace(w, { folder });
  noteFix(w, { how: "show", what: `${on.name} from Archived`, place: folder }, now);
  return { ok: true as const, folder };
}
