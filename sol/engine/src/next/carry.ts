// The move-in read (#1604, docs/port/switch.md "3. What the move-in reads"; map.md "The move-in read"): what the new face
// would show on its first run, read from today's stores. READ ONLY: it opens files and lists folders through one Reader,
// and writes nothing anywhere, not under SOL_HOME/next/ either (the person's keep, fix and drop go to movein.ts). Its
// test (carry.test.ts) runs it over a copy of a home, records every path the Reader opens, and checks that the SHA-256 of
// each of them, and of every file under the home, is the same before and after.
//   next.movein.read → next.movein { places, sessions, ais, stickies, things, asks, order, settings, yesterday }
// What it reads, and from where (switch.md's table):
//   places     the folders of the home, two deep (not hidden, not Sol's own stores), and the folders work.json holds;
//              each one's kind read from what it holds (a repo or sessions: build; stickies or Things: life), never a name
//   sessions   work.json's marks (not archived): id, pinned, done, group. Their folder comes live with work.sessions:
//              the transcripts (threads.ts) are not opened here
//   ais        SOL_HOME/agents.json: id, name, job and the folders its rules read
//   stickies   each place's stickies.md, parsed as agent/stickies.ts parses it
//   things     SOL_HOME/items/<id>/thing.json, not gone and not done; asks are those that wait on the person
//   order      work.json's order (the side as the person dragged it): the first layout follows it, no position invented
//   settings   look and text size from the settings the engine already holds (given in, not read from a file here)
//   yesterday  the log's last day before today: who, what kind, which item, when; never a value (no words)
// Signed: marcocyl04-ux's agent, slice 7b of the port (#1615).
import { readFileSync, readdirSync } from "node:fs";
import { basename, isAbsolute, join, relative } from "node:path";
import { parse as parseStickies } from "../agent/stickies.js";

/** every way carry touches the disk: read a file, list a folder. Nothing else */
export type Reader = { text(path: string): string | null; list(path: string): { name: string; dir: boolean }[] | null };
export const fsReader: Reader = {
  text(p) { try { return readFileSync(p, "utf8"); } catch { return null; } },
  list(p) { try { return readdirSync(p, { withFileTypes: true }).map((d) => ({ name: d.name, dir: d.isDirectory() })); } catch { return null; } },
};

export type Kind = "build" | "life" | null;
export type Place = { id: string; name: string; path: string; parent?: string; from: "home" | "work"; kind: Kind; holds: { repo: boolean; stickies: number; things: number; agent: boolean } };
export type MoveIn = {
  type: "next.movein";
  places: Place[];
  sessions: { id: string; pinned: boolean; done: boolean; group?: string }[];
  ais: { id: string; name: string; job: string; folders: string[] }[];
  stickies: { place: string; items: { done: boolean; t: string; s: string; notes: string[] }[] }[];
  things: { id: string; words: string; folder: string; state: string; waitsOn: string; due?: unknown }[];
  asks: { id: string; words: string; folder: string; due?: unknown }[];
  order: string[];
  settings: { look?: unknown; text?: unknown };
  yesterday: { day: string; events: { at: number; kind: string; by: unknown; item?: string }[] } | null;
};
export type Where = { home: string; state?: string; logDir?: string; settings?: Record<string, unknown>; now?: Date };

/** Sol's own stores inside a home, never a person's place */
const SKIP = new Set(["next", "items", "things", "memory", "desk", "voice", "track", "attachments", "browser-profile", "log", "data", "blocks", "sessions", "node_modules", "loose", "buttons"]);
const DEPTH = 2, MAX = 2000;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const json = (r: Reader, p: string): unknown => { const t = r.text(p); if (t === null) return null; try { return JSON.parse(t); } catch { return null; } };
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function carry(w: Where, r: Reader = fsReader): MoveIn {
  const home = w.home, now = w.now ?? new Date();
  const wj = w.state ? json(r, w.state) : null;
  const work: Record<string, unknown> = isObj(wj) ? wj : {};

  // the Things first: a place holding one is a life place
  const things: MoveIn["things"] = [];
  for (const d of r.list(join(home, "items")) ?? []) {
    if (!d.dir || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(d.name)) continue;
    const t = json(r, join(home, "items", d.name, "thing.json"));
    if (!isObj(t) || t.id !== d.name || t.gone || t.state === "done") continue;
    things.push({ id: d.name, words: String(t.words ?? ""), folder: String(t.folder ?? ""), state: String(t.state ?? ""), waitsOn: String(t.waitsOn ?? "none"), ...(t.due !== undefined ? { due: t.due } : {}) });
  }
  const thingsIn = (crumb: string) => things.filter((t) => t.folder.toLowerCase() === crumb).length;

  const places: Place[] = [], stickies: MoveIn["stickies"] = [];
  const look = (abs: string, id: string, name: string, from: Place["from"], parent?: string): Place => {
    const names = r.list(abs) ?? [];
    const has = (n: string) => names.some((x) => x.name === n);
    const sticky = has("stickies.md") ? parseStickies(r.text(join(abs, "stickies.md")) ?? "").items : [];
    if (sticky.length) stickies.push({ place: id, items: sticky });
    const holds = { repo: has(".git"), stickies: sticky.length, things: from === "home" ? thingsIn(id.split("/").join(" › ").toLowerCase()) : 0, agent: has("policy.md") };
    const kind: Kind = holds.repo || from === "work" ? "build" : holds.stickies || holds.things ? "life" : null;
    return { id, name, path: abs, ...(parent ? { parent } : {}), from, kind, holds };
  };
  const walk = (abs: string, depth: number, parent?: string) => {
    for (const d of (r.list(abs) ?? []).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (places.length >= MAX) return;
      if (!d.dir || d.name.startsWith(".") || (depth === 0 && SKIP.has(d.name))) continue;
      const sub = join(abs, d.name), id = relative(home, sub).split("\\").join("/");
      places.push(look(sub, id, d.name, "home", parent));
      if (depth + 1 < DEPTH) walk(sub, depth + 1, id);
    }
  };
  walk(home, 0);
  const hidden = new Set(Array.isArray(work.hidden) ? work.hidden.filter((x): x is string => typeof x === "string") : []);
  for (const f of Array.isArray(work.folders) ? work.folders : []) {
    if (typeof f !== "string" || !isAbsolute(f) || hidden.has(f) || places.some((p) => p.path === f) || places.length >= MAX) continue;
    places.push(look(f, f, basename(f), "work"));
  }

  const marks = isObj(work.marks) ? work.marks : {};
  const sessions = Object.entries(marks).filter(([, m]) => isObj(m) && !m.archived).map(([id, m]) => {
    const x = m as Record<string, unknown>;
    return { id, pinned: x.pinned === true, done: x.done === true, ...(typeof x.group === "string" ? { group: x.group } : {}) };
  });

  const ag = json(r, join(home, "agents.json"));
  const ais = (isObj(ag) && Array.isArray(ag.agents) ? ag.agents : []).filter(isObj).map((a) => ({
    id: String(a.id ?? ""), name: String(a.name ?? ""), job: String(a.job ?? ""),
    folders: [...new Set((Array.isArray(a.rules) ? a.rules : []).filter(isObj).map((x) => String(x.folder ?? "")).filter(Boolean))],
  })).filter((a) => a.id);

  const s = w.settings ?? {};
  return {
    type: "next.movein", places, sessions, ais, stickies, things,
    asks: things.filter((t) => t.waitsOn === "you").map((t) => ({ id: t.id, words: t.words, folder: t.folder, ...(t.due !== undefined ? { due: t.due } : {}) })),
    order: Array.isArray(work.order) ? work.order.filter((x): x is string => typeof x === "string") : [],
    settings: { ...(s.look !== undefined ? { look: s.look } : {}), ...(s.text !== undefined ? { text: s.text } : {}) },
    yesterday: w.logDir ? lastDay(r, w.logDir, day(now)) : null,
  };
}

/** the log's newest day before today, its events without their values (log.ts: <logDir>/<day>.jsonl) */
function lastDay(r: Reader, dir: string, today: string): MoveIn["yesterday"] {
  const days = (r.list(dir) ?? []).filter((d) => !d.dir && /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(d.name)).map((d) => d.name.slice(0, 10)).filter((d) => d < today).sort();
  const d = days[days.length - 1];
  if (!d) return null;
  const events: NonNullable<MoveIn["yesterday"]>["events"] = [];
  for (const l of (r.text(join(dir, `${d}.jsonl`)) ?? "").split("\n")) {
    if (!l.trim()) continue;
    try {
      const e = JSON.parse(l);
      if (isObj(e) && typeof e.kind === "string") events.push({ at: typeof e.at === "number" ? e.at : 0, kind: e.kind, by: e.by ?? null, ...(typeof e.item === "string" ? { item: e.item } : {}) });
    } catch { /* a broken line: skipped */ }
  }
  return { day: d, events };
}
