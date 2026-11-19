// Home 8 (#874; face #799): places, behind home.whole. One message, `home.places { places, people }`
// (contract/home/places.ts), computed on every ask from the disk and the Thing store, never stored (R8), nothing written.
//   from files   each folder the files source reads (its scope, source-files.ts: `reads`, less what it `never` reads),
//                and its sub-folders two deep: a place a folder, `name` its own name in lower case, `path` the crumb of
//                names joined by " › " (the crumb a Thing carries in `folder`, so the face's inPlace finds its Things),
//                `parent` the id of the folder above, `from { source: "files", ref: <its absolute path>, label: <its
//                path as "~/School/bio 201"> }`. Only folder names are read, never a file, never a link to elsewhere
//   from you     a folder a Thing on the list names (not gone, not done) that the disk does not have: a place, and each
//                crumb above it, `from.source` "you", so no Thing is left off the side
//   Canvas       not built: no Canvas source exists in the engine (sign-in, a key and a network call, none tonight). A
//                course never shows; `knows` is always [] (what a place knows comes from Canvas)
//   people       always []: no source knows people
// With no files source registered, or nothing in its scope, and no Thing in a folder: places is [].
// Answers: home.places to the asker. Once any window has asked, a Thing change that changes the places (a Thing filed in
// a folder that is new) sends home.places to every window; the disk is read again only on an ask or such a change.
import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import type { Face } from "../browser.js";
import type { Scope } from "../contract/home/policy.js";
import type { From, PlaceItem, PlacesMsg } from "../contract/home/places.js";
import { sourcesMsg } from "./sources.js";
import type { Ctx, Handler, Unit } from "./unit.js";

// ── the names and numbers that are the engine's pick, not Marco's: in one place, so one edit changes them ───────────
/** between two names of a crumb (Marco's, W/places.ts l.59: space, U+203A, space) */
export const CRUMB = " › ";
/** how far below a folder the files source reads the side goes */
const DEPTH = 2;
/** at most so many sub-folders read in one folder (the files source's own cap), and so many places in all */
const PER_FOLDER = 500, MAX = 2000;
/** a place's id: the slug of its crumb ("school › bio 201" → "school-bio-201"); a crumb with no letter or digit, or
 *  one whose slug another place has, is p-<12 hex of its crumb> */
const slug = (path: string): string => path.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
const hashId = (path: string): string => `p-${createHash("sha256").update(path).digest("hex").slice(0, 12)}`;
/** where a place you made comes from (Marco's words for it, W/places.ts l.26) */
const YOURS: From = { source: "you", ref: "you", label: "a place you made" };

type Raw = { name: string; path: string; parentPath?: string; from: From };

const under = (p: string, dir: string): boolean => { const r = relative(dir, p); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };
/** a name that can stand in a crumb: not hidden, not empty, no " › " of its own, no control character */
const fits = (name: string): boolean => !!name.trim() && !name.startsWith(".") && !name.includes("›") && !/[\u0000-\u001f\u007f]/.test(name);
const isDir = (p: string): boolean => { try { return statSync(p).isDirectory(); } catch { return false; } };

/** the folders a files source's scope reads, as places without ids (pure but for reading folder names). `user` is the
 *  person's own folder, what "~" means (os.homedir(); a test's own) */
export function diskFolders(scope: Scope, user: string = homedir()): Raw[] {
  const real = (p: string): string => resolve(p === "~" ? user : p.startsWith("~/") ? join(user, p.slice(2)) : isAbsolute(p) ? p : join(user, p));
  const label = (abs: string): string => (under(abs, user) ? (abs === resolve(user) ? "~" : `~/${relative(user, abs)}`) : abs);
  const never = scope.never.map(real);
  const out: Raw[] = [], seen = new Set<string>();
  const walk = (abs: string, name: string, parentPath: string | undefined, depth: number): void => {
    if (out.length >= MAX || never.some((n) => under(abs, n))) return;
    const path = parentPath === undefined ? name : `${parentPath}${CRUMB}${name}`;
    if (seen.has(path)) return;   // two folders of one crumb (School and school, two scopes named alike): the first
    seen.add(path);
    out.push({ name, path, ...(parentPath !== undefined ? { parentPath } : {}), from: { source: "files", ref: abs, label: label(abs) } });
    if (depth >= DEPTH) return;
    let subs: string[] = [];
    try {
      // a real folder only: a link (to a folder elsewhere) is not followed
      subs = readdirSync(abs, { withFileTypes: true }).filter((d) => d.isDirectory() && fits(d.name)).map((d) => d.name).sort().slice(0, PER_FOLDER);
    } catch { /* unreadable: nothing below it */ }
    for (const s of subs) walk(join(abs, s), s.trim().toLowerCase(), path, depth + 1);
  };
  for (const p of scope.reads) {
    const abs = real(p), name = basename(abs);
    if (fits(name) && isDir(abs)) walk(abs, name.trim().toLowerCase(), undefined, 0);
  }
  return out;
}

/** the places with their ids, parents before children as given (pure) */
export function withIds(raw: Raw[]): PlaceItem[] {
  const ids = new Map<string, string>(), taken = new Set<string>();
  for (const r of raw) {
    let id = slug(r.path);
    if (!id || taken.has(id)) id = hashId(r.path);
    taken.add(id); ids.set(r.path, id);
  }
  return raw.map((r) => ({
    id: ids.get(r.path)!, name: r.name, path: r.path,
    ...(r.parentPath !== undefined && ids.has(r.parentPath) ? { parent: ids.get(r.parentPath)! } : {}),
    from: r.from, knows: [],
  }));
}

/** the whole of places now (R8: the same disk and store give the same message). `user`: what "~" means */
export function placesMsg(ctx: Ctx, user?: string): PlacesMsg {
  const files = sourcesMsg(ctx, null).sources.find((s) => s.id === "files");
  const raw = files ? diskFolders(files.scope, user) : [];
  const have = new Set(raw.map((r) => r.path));
  // the folders the Things on the list name that the disk has not, each crumb above them too
  for (const t of ctx.items.all()) {
    if (t.gone || t.state === "done" || !t.folder) continue;
    const names = t.folder.split(CRUMB);
    if (names.some((n) => !n.trim())) continue;
    for (let i = 0; i < names.length && raw.length < MAX; i++) {
      const path = names.slice(0, i + 1).join(CRUMB);
      if (have.has(path)) continue;
      have.add(path);
      raw.push({ name: names[i], path, ...(i ? { parentPath: names.slice(0, i).join(CRUMB) } : {}), from: YOURS });
    }
  }
  return { type: "home.places", places: withIds(raw), people: [] };
}

// ── answering ────────────────────────────────────────────────────────────────────────────────────────────────────
/** the places last sent from a Home, as JSON: a Home no window asked has none, and is never pushed to */
const SENT = new WeakMap<Ctx, string>();
/** home.places: the ask has no field of its own (PlacesAsk), so whatever else it carries the answer is the state */
const ask: Handler = (ctx, face: Face) => {
  const m = placesMsg(ctx);
  SENT.set(ctx, JSON.stringify(m));
  face.send(m);
};
/** after a Thing changed (once the act that changed it is through, its awaits too: setImmediate, not a microtask): the
 *  places to every window, if they changed */
const due = new WeakSet<Ctx>();
function later(ctx: Ctx): void {
  if (!SENT.has(ctx) || due.has(ctx)) return;
  due.add(ctx);
  setImmediate(() => {
    due.delete(ctx);
    try {
      const m = placesMsg(ctx), text = JSON.stringify(m);
      if (text === SENT.get(ctx)) return;
      SENT.set(ctx, text);
      ctx.all(m);
    } catch (err) { console.error("home: places:", err instanceof Error ? err.message : String(err)); }
  });
}

export const places: Unit = {
  name: "places",
  handlers: { "home.places": ask },
  start(ctx) {
    ctx.log.on((e) => { if (e.kind === "thing.new" || e.kind === "thing.state" || e.kind === "thing.done") later(ctx); });
  },
};
