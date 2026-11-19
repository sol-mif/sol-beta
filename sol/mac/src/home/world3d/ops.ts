// Home's world (#1093): the changes the world's hand makes to a folder's stickies.md, as pure steps over its list. Each
// finds the sticky by its title (never by its place, so a write the folder's agent made meanwhile is not lost or hit
// twice) and returns the list unchanged when the sticky is not there. The same step runs twice: once on what the
// world shows (at once), once on the file as it is read just before the write.
import { NOW, stamp, type Made } from "../folders/stickies.ts";

export type Op = (items: Made[]) => Made[];
const at = (l: Made[], key: string) => l.findIndex((m) => m.t === key);

/** "do it": the folder's agent is on this one ("asked <when> ← now", the mark taken off every other, as Home's press) */
export const markNow = (key: string, when = stamp()): Op => (l) =>
  at(l, key) < 0 ? l : l.map((m) => ({ ...m, notes: [...m.notes.map((n) => n.replace(NOW, "")), ...(m.t === key ? [`asked ${when}${NOW}`] : [])] }));
/** the run ended: the mark off, if the agent left it */
export const settle: Op = (l) => (l.some((m) => m.notes.some((n) => n.endsWith(NOW))) ? l.map((m) => ({ ...m, notes: m.notes.map((n) => n.replace(NOW, "")) })) : l);
/** ticked done, or back */
export const tick = (key: string, done: boolean): Op => (l) => (at(l, key) < 0 ? l : l.map((m) => (m.t === key ? { ...m, done } : m)));
/** taken out of this folder (filed elsewhere) */
export const takeOut = (key: string): Op => (l) => { const i = at(l, key); return i < 0 ? l : l.filter((_, k) => k !== i); };
/** may a sticky of this title be filed here: not when one by that title is already there (it would be two in one, or lost) */
export const canFile = (to: Made[], key: string) => at(to, key) < 0;
/** put into this folder, at its end; when one of the same title is there the list comes back unchanged (the same
 *  array), so the caller knows nothing went in and must not take it out of where it was */
export const putIn = (m: Made): Op => (l) => (at(l, m.t) >= 0 ? l : [...l, { ...m, notes: [...m.notes] }]);

/** did the folder's agent finish this sticky: it has a "did:" line it did not have when it was asked, and no mark */
export function finished(before: Made | undefined, after: Made | undefined): boolean {
  if (!after) return false;
  if (after.notes.some((n) => n.endsWith(NOW))) return false;
  const did = (m?: Made) => (m?.notes ?? []).filter((n) => /^did\b/i.test(n.trim())).length;
  return did(after) > did(before);
}

/** the same sticky as it was read: same box, same notes (a line the agent wrote since makes it another) */
export const same = (a: Made, b: Made) => a.t === b.t && a.done === b.done && a.s === b.s && a.notes.length === b.notes.length && a.notes.every((n, i) => n === b.notes[i]);
/** taken out of its folder after it was filed, only if it is still the one that was filed; else the list unchanged
 *  (the same array), and the caller says it is in both */
export const takeOutIf = (m: Made): Op => (l) => { const i = at(l, m.t); return i >= 0 && same(l[i], m) ? l.filter((_, k) => k !== i) : l; };

/** tied to a project by hand: one note "with: <project>" under the sticky, so its folder's agent knows what it is for
 *  (once; tied again to the same project changes nothing) */
const withLine = (project: string) => (n: string) => n.trim().toLowerCase() === `with: ${project}`.toLowerCase();
/** (the same list back when it is already tied, or not there: the caller reads "nothing added" from that) */
export const tie = (key: string, project: string): Op => (l) => {
  const i = at(l, key); if (i < 0 || l[i].notes.some(withLine(project))) return l;
  return l.map((m, k) => (k === i ? { ...m, notes: [...m.notes, `with: ${project}`] } : m));
};
export const untie = (key: string, project: string): Op => (l) => {
  const i = at(l, key); if (i < 0 || !l[i].notes.some(withLine(project))) return l;
  return l.map((m, k) => (k === i ? { ...m, notes: m.notes.filter((n) => !withLine(project)(n)) } : m));
};
/** the ties a folder's list holds: [sticky's title, project's name] for each "with:" note */
export const tiesIn = (l: Made[]): { thing: string; project: string }[] =>
  l.flatMap((m) => m.notes.map((n) => /^with:\s*(.+)$/i.exec(n.trim())).filter((x): x is RegExpExecArray => !!x).map((x) => ({ thing: m.t.replace(/\s*← now\s*$/, ""), project: x[1].trim() })));

// ---- the rules the hand is held to (pure, so the tests reach them) ----
/** the agent is on it ("← now" under it, not ticked): it is not filed or moved until it is done */
export const running = (m: Made) => !m.done && m.notes.some((n) => n.endsWith(NOW));
/** a real sticky is tied only to a real project, never to one drawn for a made-up day */
export const canTie = (drawnProjects: boolean) => !drawnProjects;
/** a made-up person's folder is read only from under the home or a scratch folder (~/computer/scratch or ~/scratch) */
export function personAllowed(path: string | null, home: string | null): string | null {
  if (!path || /(^|\/)\.\.(\/|$)/.test(path)) return null;
  const ok = (home && path.startsWith(`${home}/`)) || /^\/(home|Users)\/[^/]+\/(computer\/)?scratch\//.test(path);
  return ok ? path.replace(/\/+$/, "") : null;
}
/** what Jev is told for pick 2: each waiting sticky's title and how many wait behind it in its folder, nothing else */
export const edgeAsk = (want: { id: string; name: string; kind: string }[], folders: { id: string; things: { id: string; mood: string }[] }[]) =>
  want.filter((a) => a.kind === "thing").map((a) => { const f = folders.find((x) => x.things.some((t) => t.id === a.id));
    return { id: a.id, words: a.name, age: "", behind: f ? `${f.things.filter((x) => x.mood !== "done" && x.id !== a.id).length} more open in its folder` : "" }; });

/** the names in one part's line: " · " between them (a folder's name may hold a comma); a line written before 05:00
 *  with commas still reads */
const namesIn = (s: string, legacy = false) => (s.includes(" · ") || !legacy ? s.split(" · ") : s.split(",")).map((n) => n.trim()).filter(Boolean);   // commas only in a line from before the marks
const partLine = /^\s*-\s*([^:]+):\s*(.*)$/;

export const WORLD_HEAD = "# Where things are\n\nAs you arranged them in Home's world, left to right in each part of your life.\n\n";
/** the block Home's world writes in world.md: only lines between these two are ever changed by it */
export const WORLD_OPEN = "<!-- Home's world: the lines between these two marks are rewritten when you move things there -->";
export const WORLD_CLOSE = "<!-- /Home's world -->";
const bare = (l: string) => l.replace(/\r$/, "");
/** where the world's lines are in world.md: between its two marks; in a file from before the marks, the lines under its
 *  "# Where things are" heading up to the next heading. [from, to): line indexes. null: no such place in the file */
function region(lines: string[]): [number, number] | null { return place(lines)?.r ?? null; }
/** the world's place and whether it is the marked block (else a file from before the marks: its heading's section) */
function place(lines: string[]): { r: [number, number]; marked: boolean } | null {
  const isO = (l: string) => bare(l).trim() === WORLD_OPEN, isC = (l: string) => bare(l).trim() === WORLD_CLOSE;
  // each close, in order, with the last open before it (and after the close before it): the first such pair is the
  // block; a stray close (its open deleted) or a stray open (its close deleted) is passed over, never paired
  for (let c = 0, prev = -1; c < lines.length; c++) { if (!isC(lines[c])) continue; const o = lines.slice(prev + 1, c).map(isO).lastIndexOf(true); if (o >= 0) return { r: [prev + 1 + o + 1, c], marked: true }; prev = c; }
  if (lines.some(isO) || lines.some(isC)) return null;   // marks that do not pair (one deleted by hand): a new block at the end
  const h = lines.findIndex((l) => /^#\s+Where things are\s*$/.test(bare(l)));
  if (h < 0) return null;
  const n = lines.findIndex((l, k) => k > h && /^#/.test(bare(l)));
  return { r: [h + 1, n < 0 ? lines.length : n], marked: false };
}
/** the first line for a part inside the world's place (lines elsewhere are his own, never read or changed) */
function lineOf(lines: string[], r: [number, number], part: string): number {
  for (let k = r[0]; k < r[1]; k++) { const m = partLine.exec(bare(lines[k])); if (m && m[1].trim().toLowerCase() === part.toLowerCase()) return k; }
  return -1;
}

/** his arrangement read back from world.md ("- <part>: <folder> · <folder> · …"), only inside the world's place: each
 *  part's folder ids in his order, by the names written there; the first line for a part counts; a name no longer
 *  there is skipped, a folder not named keeps its place after them */
export function orderFrom(text: string, parts: { id: string; name: string }[], folders: { id: string; name: string; part: string }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}, lines = text.split("\n"), pl = place(lines);
  if (!pl) return out; const r = pl.r;
  for (let k = r[0]; k < r[1]; k++) {
    const m = partLine.exec(bare(lines[k])); if (!m) continue;
    const part = parts.find((p) => p.name.toLowerCase() === m[1].trim().toLowerCase()); if (!part || part.id in out) continue;
    const ids = namesIn(m[2], !pl.marked).map((n) => folders.find((f) => f.part === part.id && f.name.toLowerCase() === n.toLowerCase())?.id).filter((x): x is string => !!x);
    if (ids.length) out[part.id] = [...new Set(ids)];
  }
  return out;
}

/** world.md after one part was rearranged by hand: only that part's first line inside the world's place is replaced
 *  (a name on it that is not one of `names` is carried over, after them); every other line is kept byte for byte, his
 *  notes anywhere else included, and a line ending in \r keeps it. No line for the part: it goes at the end of the
 *  world's place. No place in the file: the marked block goes at its end. `prev` null: no world.md yet, a new one. */
export function worldMd(prev: string | null, part: string, names: string[]): string {
  const mk = (ns: string[], cr = "") => `- ${part}: ${ns.join(" · ")}${cr}`;
  if (prev === null) return `${WORLD_HEAD}${WORLD_OPEN}\n${mk(names)}\n${WORLD_CLOSE}\n`;
  const lines = prev.split("\n"), pl = place(lines), r = pl?.r ?? null, crlf = prev.includes("\r\n") ? "\r" : "";
  if (!r) { const nl = crlf ? "\r\n" : "\n", sep = !prev.length ? "" : prev.endsWith("\n") ? nl : nl + nl; return prev + sep + [WORLD_OPEN, mk(names), WORLD_CLOSE].join(nl) + nl; }
  const i = lineOf(lines, r, part);
  if (i >= 0) {
    const was = namesIn(partLine.exec(bare(lines[i]))![2], !pl!.marked), known = new Set(names.map((n) => n.toLowerCase()));
    lines[i] = mk([...names, ...was.filter((n) => !known.has(n.toLowerCase()))], lines[i].endsWith("\r") ? "\r" : "");
    return lines.join("\n");
  }
  let at = r[1]; while (at > r[0] && bare(lines[at - 1]).trim() === "") at--;   // after the place's last line, before its blank tail
  lines.splice(at, 0, mk(names, crlf));
  return lines.join("\n");
}

/** the write of one rearranged part, held to the file as it is: read (with its hash), the one line changed, written with
 *  that hash; the file changed between the two: again, three times. No answer, or any error but "not there": nothing
 *  is written and the reason comes back. Pure over its two engine calls, so the tests reach it. */
export async function writeWorldMd(
  read: () => Promise<{ text?: string; hash?: string; error?: string } | null | undefined>,
  write: (text: string, hash?: string) => Promise<{ ok?: boolean; changed?: boolean; error?: string } | null | undefined>,
  part: string | ((prev: string | null) => string), names: string[] = [],
): Promise<string | null> {
  const edit = typeof part === "function" ? part : (prev: string | null) => worldMd(prev, part, names);
  for (let k = 0; k < 3; k++) {
    const r = await read();
    if (!r) return "Not written to world.md: the engine did not answer.";
    const missing = !!r.error && /ENOENT|no such/i.test(r.error);
    if (r.error && !missing) return `Not written to world.md: ${r.error}.`;
    if (!missing && (typeof r.text !== "string" || !r.hash)) return "Not written to world.md: it could not be read as text.";   // too big, binary, or no hash: never written over
    const text = edit(missing ? null : (r.text as string));
    if (missing ? text === "" : text === r.text) return null;   // nothing changes: nothing is written (an undo of a tie with no world.md makes none)
    const w = await write(text, missing ? "" : r.hash);   // "" = only if it is still not there (a create, never over one made meanwhile)
    if (w?.ok) return null;
    if (!w?.changed) return `Not written to world.md: ${w?.error ?? "the engine did not answer"}.`;
  }
  return "Not written to world.md: it kept changing under it.";
}

/** Jev's pick 3, which sessions just stopped: busy at the last look, not busy now, neither waiting for him nor failed
 *  (those say for themselves what they are). `busy` is the ids busy now, for the next look. */
export function stopped(was: Set<string>, projects: { sessions: { id: string; busy: boolean; waiting: boolean; failed: boolean }[] }[]): { ended: string[]; busy: Set<string> } {
  const all = projects.flatMap((p) => p.sessions), busy = new Set(all.filter((s) => s.busy).map((s) => s.id));
  return { ended: all.filter((s) => was.has(s.id) && !s.busy && !s.waiting && !s.failed).map((s) => s.id), busy };
}
/** what pick 3's answer does: 0.7 and over shelves it, 0.45 and over shows the dashed outline, under (or none) nothing */
export const doneBy = (p: number | null | undefined): "shelve" | "ghost" | null => (p == null ? null : p >= 0.7 ? "shelve" : p >= 0.45 ? "ghost" : null);

/** Jev's pick 5, the record read back (pure): the districts he went to at about this hour (within an hour either side)
 *  on days before today, oldest first, the last five. Lines with no place (or unreadable) are passed over. */
export function placesAt(moves: { at?: unknown; place?: unknown }[], now: Date): string[] {
  const day = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, today = day(now), h = now.getHours() + now.getMinutes() / 60;
  const out: string[] = [];
  for (const m of moves) {
    if (typeof m?.place !== "string" || !m.place || typeof m.at !== "string") continue;
    const d = new Date(m.at); if (Number.isNaN(d.getTime()) || day(d) === today || d > now) continue;
    const x = d.getHours() + d.getMinutes() / 60, gap = Math.min(Math.abs(x - h), 24 - Math.abs(x - h));
    if (gap <= 1) out.push(m.place);
  }
  return out.slice(-5);
}
/** what pick 5's answer does: 0.7 and over the first view leans there, 0.45 and over a ring on its name, else whole */
export const leanBy = (a: { part?: string | null; confidence?: number } | null | undefined): { part: string; sure: boolean } | null =>
  !a?.part || a.confidence == null || a.confidence < 0.45 ? null : { part: a.part, sure: a.confidence >= 0.7 };

// ---- Jev's pick 4: are two things tied ----
// "- tied: <a> / <b>": a folder's or a project's name is a folder's name, which cannot hold "/"; a line written with " + "
// before 07:55 still reads
const TIE = /^\s*-\s*tied:\s*(.+?)\s+\/\s+(.+?)\s*$/i, TIE_OLD = /^\s*-\s*tied:\s*(.+?)\s+\+\s+(.+?)\s*$/i;
const tieOf = (l: string) => TIE.exec(l) ?? TIE_OLD.exec(l);
/** two things he opened within a minute of each other on three days or more (of the last fourteen), both still there:
 *  the pairs, most days first. `moves` is the world's own record; `known` the ids drawn now. Pure. */
export function pairsFrom(moves: { at?: unknown; id?: unknown }[], now: Date, known: Set<string>): { a: string; b: string; days: number }[] {
  const ok = moves.filter((m): m is { at: string; id: string } => typeof m?.at === "string" && typeof m.id === "string" && known.has(m.id))
    .map((m) => ({ t: new Date(m.at).getTime(), id: m.id })).filter((m) => Number.isFinite(m.t) && m.t <= now.getTime() && now.getTime() - m.t < 14 * 864e5).sort((x, y) => x.t - y.t);
  const days = new Map<string, Set<string>>();
  for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length && ok[j].t - ok[i].t <= 60_000; j++) {
    if (ok[i].id === ok[j].id) continue;
    const [a, b] = [ok[i].id, ok[j].id].sort(), k = `${a}|${b}`, d = new Date(ok[i].t);
    (days.get(k) ?? days.set(k, new Set()).get(k)!).add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  return [...days].filter(([, d]) => d.size >= 3).map(([k, d]) => { const [a, b] = k.split("|"); return { a, b, days: d.size }; }).sort((x, y) => y.days - x.days);
}
/** the ties kept in world.md's place ("- tied: <a> / <b>"), by name, lower-cased. Pure */
export function tiesFromMd(text: string): [string, string][] {
  const lines = text.split("\n"), r = region(lines); if (!r) return [];
  const out: [string, string][] = [];
  for (let k = r[0]; k < r[1]; k++) { const m = tieOf(bare(lines[k])); if (m) out.push([m[1].toLowerCase(), m[2].toLowerCase()]); }
  return out;
}
/** world.md with a tie kept (on) or taken off (off): one line "- tied: <a> / <b>" at the end of the world's place, his
 *  lines kept byte for byte; taking off removes only that line (either order). Pure */
export function worldMdTie(prev: string | null, a: string, b: string, on: boolean): string {
  const same = (l: string) => { const m = tieOf(bare(l)); if (!m) return false; const x = [m[1], m[2]].map((s) => s.toLowerCase()).sort().join("|"); return x === [a, b].map((s) => s.toLowerCase()).sort().join("|"); };
  if (prev === null) return on ? `${WORLD_HEAD}${WORLD_OPEN}\n- tied: ${a} / ${b}\n${WORLD_CLOSE}\n` : "";
  const lines = prev.split("\n"), r = region(lines);
  if (!on) { if (!r) return prev; for (let k = r[0]; k < r[1]; k++) if (same(lines[k])) { lines.splice(k, 1); return lines.join("\n"); } return prev; }
  if (r && lines.slice(r[0], r[1]).some(same)) return prev;
  const crlf = prev.includes("\r\n") ? "\r" : "", line = `- tied: ${a} / ${b}`;
  if (!r) { const nl = crlf ? "\r\n" : "\n", sep = !prev.length ? "" : prev.endsWith("\n") ? nl : nl + nl; return prev + sep + [WORLD_OPEN, line, WORLD_CLOSE].join(nl) + nl; }
  let at = r[1]; while (at > r[0] && bare(lines[at - 1]).trim() === "") at--;
  lines.splice(at, 0, line + crlf);
  return lines.join("\n");
}

/** Jev's pick 3 at the open: the sessions drawn now that ended earlier today (their last message today; not working,
 *  not waiting for him, not failed, quiet half an hour: a talk in a terminal is not "busy" to the engine) and not asked
 *  yet today, newest first, at most `cap`. Pure */
export function endedToday(projects: { sessions: { id: string; busy: boolean; waiting: boolean; failed: boolean; at?: number }[] }[], now: Date, asked: Set<string>, cap = 6, quiet = 30 * 60_000): string[] {
  const day = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }, today = day(now.getTime());
  return projects.flatMap((p) => p.sessions).filter((s) => s.at != null && s.at <= now.getTime() - quiet && day(s.at) === today && !s.busy && !s.waiting && !s.failed && !asked.has(s.id))
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, cap).map((s) => s.id);
}

/** the shelved sessions whose talk moved on since they were shelved (a newer last message): they come off the shelf. Pure */
export function movedOn(shelved: { id: string; at?: number }[], projects: { sessions: { id: string; at?: number }[] }[]): string[] {
  const now = new Map(projects.flatMap((p) => p.sessions).map((s) => [s.id, s.at]));
  return shelved.filter((q) => q.at != null && (now.get(q.id) ?? 0) > q.at).map((q) => q.id);
}

/** what a read of stickies.md said (pure): its text and hash; "missing" (the file is not there: an empty list, written
 *  as a create); "not there" (the folder itself, not set up: answered, no list); or null (no answer, an error, or no
 *  text or no hash, as for a file too big or binary: keep what is shown and never write over it) */
export function readSaid(r: { text?: unknown; hash?: unknown; error?: unknown } | null | undefined): { text: string; hash: string } | "missing" | "not there" | null {
  if (!r) return null;
  if (r.error) { const e = String(r.error); return /folder is not there/i.test(e) ? "not there" : /ENOENT|no such/i.test(e) ? "missing" : null; }
  return typeof r.text === "string" && typeof r.hash === "string" && r.hash ? { text: r.text, hash: r.hash } : null;
}

/** the name Jev is told for a folder (picks 1, 4, 6; pure): FolderHome's fixed folders by their name; in a world drawn
 *  with its own folders (the record's Home, onboard/OneHome.tsx: an area's name is made from what the person typed, a
 *  school or an employer) only its part's word (school, work, life, projects), never the area's name (onboard/jev.ts) */
export const toldAs = (f: { name: string; part: string }, own?: Own): string => {
  if (!own) return f.name;
  const n = own.parts.find((p) => p.id === f.part)?.name; return typeof n === "string" && n ? n : "a folder";   // a part outside PART: never "undefined"
};
type Own = { parts: { id: string; name: string }[] };

/** pick 1's folders as Jev is told them (pure): in a world drawn with its own folders, an area's id is made from its name
 *  (onboard/sort.ts slug: "northwood"), so each goes by its place in the list ("f1") and its part's word; `real` turns
 *  Jev's answer back into the folder's id. FolderHome's fixed folders: by their id and name, as before */
export function toldFolders(fs: { id: string; name: string; part: string; things: string[] }[], own?: { parts: { id: string; name: string }[] }) {
  const folders = fs.map((f, i) => ({ id: own ? `f${i + 1}` : f.id, name: toldAs(f, own), things: f.things }));
  return { folders, real: (id: string) => fs[folders.findIndex((x) => x.id === id)]?.id ?? null };
}

/** what Jev's pick 4 is told of one end of a pair (pure): a folder by its name; a project only as "a project" (its
 *  name is his own and never leaves the machine); anything else, nothing */
export function tieTold(id: string, folders: { id: string; name: string }[], projects: { id: string }[]): { name: string; kind: "folder" | "project" } | null {
  if (projects.some((p) => p.id === id)) return { name: "a project", kind: "project" };
  const f = folders.find((x) => x.id === id); return f ? { name: f.name, kind: "folder" } : null;
}

// The messages Jev's picks send, built here so World3D sends exactly these and a test can read them. In a world drawn
// with its own folders (the record's Home) no folder's name or id leaves: an id is the slug of a typed name
// ("northwood", "northwood#0"), so each is numbered and Jev's answer mapped back (as toldFolders does for pick 1).

/** pick 2 (agent.first): the waiting stickies; with own folders each goes by its place ("t1"), not `${folder}#${i}` */
export function edgeTold(want: { id: string; name: string; kind: string }[], folders: { id: string; things: { id: string; mood: string }[] }[], own?: Own) {
  const real = edgeAsk(want, folders), things = own ? real.map((t, i) => ({ ...t, id: `t${i + 1}` })) : real;
  return { things, real: (id: string) => real[things.findIndex((x) => x.id === id)]?.id ?? null };
}
/** pick 4 (agent.tied): both ends as Jev is told them (tieTold through toldAs), or null when an end is not drawn or both
 *  are projects (Jev would hear "a project" twice, nothing to judge) */
export function tiedMsg(pair: { a: string; b: string; days: number }, folders: { id: string; name: string; part: string }[], projects: { id: string }[], own?: Own) {
  const fs = folders.map((f) => ({ id: f.id, name: toldAs(f, own) })), a = tieTold(pair.a, fs, projects), b = tieTold(pair.b, fs, projects);
  return a && b && !(a.kind === "project" && b.kind === "project") ? { type: "agent.tied", a, b, days: pair.days } as const : null;
}
/** pick 5 (agent.opens): the hour, the titles of what waits (a session as "a session") and works, the districts and
 *  where he went at about this hour. With own folders the districts are the part words and `recent` keeps only those.
 *  null: fewer than two places to lean to */
export function opensMsg(d: { parts: { id: string; name: string; folders: { things: { name: string; mood: string }[] }[] }[]; projects: { sessions: { busy: boolean }[] }[] }, want: { kind: string; name: string }[], hour: number, recent: string[], own?: Own) {
  const places = [...d.parts.map((p) => ({ id: p.id, name: own ? toldAs({ name: p.name, part: p.id }, own) : p.name })), ...(d.projects.length ? [{ id: "build", name: "build" }] : []), ...(want.length ? [{ id: "edge", name: "front edge" }] : [])];
  if (places.length < 2) return null;
  const working = [...d.parts.flatMap((p) => p.folders.flatMap((f) => f.things.filter((t) => t.mood === "run").map((t) => t.name))), ...d.projects.flatMap((p) => p.sessions.filter((x) => x.busy).map(() => "a session"))];   // a session's title can be his first prompt: never to Jev
  return { type: "agent.opens", hour, waiting: want.map((a) => (a.kind === "session" ? "a session" : a.name)), working, places, recent: own ? recent.filter((r) => places.some((p) => p.id === r)) : recent } as const;
}
/** pick 6 (agent.form): a folder by toldAs, its part's word and its last five stickies' titles */
export const formAsk = (f: { name: string; part: string; things: { name: string }[] }, part: string, own?: Own) =>
  ({ name: toldAs(f, own), part: own ? toldAs({ name: part, part: f.part }, own) : part, things: f.things.slice(-5).map((t) => t.name) });
