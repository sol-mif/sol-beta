// The pieces' built-in sources (#1092, pieces.ts): rows read from what Sol's project already has, named in a recipe as
// { "from": "builtin", "name": "<one of these>", "url"?, "fixture"? }. A new one is one function here; anything a folder
// alone needs is a script in its .sol/pieces instead. Each reads only: no source writes anywhere (ceiling look/draft).
//   waits    open pull requests ready for a press (green first) and open `decision` issues, from GitHub (gh)
//   runs     what runs on which machine now, from the NucBox's runs board
//   systems  the systems registry (sol/systems, part 5): what is broken now, then each area with its count
//   recent   the folder's files changed last (morning round of 11-13: a starter any folder can keep, no address)
//   git      the folder's git state: its branch, what is changed and not committed, the last commits (a starter too)
// A source that cannot reach its place reads its fixture (a file in the folder) and says so in `from`.
import { execFile } from "node:child_process";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import type { Read, Row } from "./pieces.js";
import type { Tier } from "./pieceJev.js";
import { SYSTEMS_BOARD } from "../agent/areas.js";   // #1093: the board's address, one place
import { quietGh } from "../quiet.js";

export type Help = { getJson: (url: string, ms?: number) => Promise<unknown>; readJson: (path: string) => unknown; readText?: (path: string) => string | null;
  /** the .json files under a folder of the project, its own paths, deepest last (none when it is not there) */
  jsonFiles?: (dir: string) => string[] };
type Src = { url?: string; fixture?: string; night?: string; labels?: string[] };
type Builtin = (cwd: string, s: Src, h: Help) => Promise<Read>;

const ago = (ms: number) => { const m = Math.max(0, Math.round(ms / 60_000)); return m < 60 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };
/** why a gh call failed, in words (pure): signed out, no such label, else its own first line */
export function ghWhy(errOut: string, err: { message?: string; killed?: boolean } = {}): string {
  if (err.killed) return "GitHub did not answer in 20 s";
  const line = errOut.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  if (/auth login|not logged|authenticat/i.test(line)) return "GitHub is not signed in here (gh auth login)";
  if (/could not add label|not found/i.test(line)) return `GitHub: ${line.slice(0, 120)}`;
  return line ? `GitHub: ${line.slice(0, 120)}` : "GitHub did not answer";
}
const gh = (cwd: string, args: string[]) => new Promise<unknown>((ok, no) => {
  quietGh(args);
  execFile("gh", args, { cwd, timeout: 20_000, maxBuffer: 8 << 20 }, (err, out, errOut) => {
    // in words, never the command line: what GitHub's tool said, else that it did not answer
    if (err) return no(new Error(ghWhy(String(errOut ?? ""), err)));
    try { ok(JSON.parse(out)); } catch { no(new Error("gh did not answer json")); }
  });
});
/** the NucBox's address, one setting outside the repo: SOL_NUCBOX, else pieces-places.json beside the engine's
 *  work.json ({ "nucbox": "<host>" }); none: the tools that read it say so and show their fixture */
export function nucbox(env: NodeJS.ProcessEnv = process.env, file?: string): string | null {
  const ok = (h: unknown) => (typeof h === "string" && /^[\w.-]{1,80}$/.test(h.trim()) ? h.trim() : null);
  if (ok(env.SOL_NUCBOX)) return ok(env.SOL_NUCBOX);
  try { return ok((JSON.parse(readFileSync(file ?? join(dirname(env.SOL_STATE ?? join(homedir(), ".local", "share", "sol", "work.json")), "pieces-places.json"), "utf8")) as { nucbox?: unknown }).nucbox); } catch { return null; }
}
/** why a NucBox source cannot be read here, in words a person reads (never the setting's name) */
export const NO_NUCBOX = "this reads the NucBox, and this computer does not know where the NucBox is";
/** an address on the NucBox, or a reason it cannot be read (the fixture then says why) */
const onNucbox = (port: number, path = "/") => { const h = nucbox(); if (!h) throw new Error(NO_NUCBOX); return `http://${h}:${port}${path}`; };

/** the recipe's own address, else the NucBox's (throws when neither: the fixture says why) */
const onUrl = (url: string | undefined, port: number, path: string) => url ?? onNucbox(port, path);

/** read the place, else the fixture, saying which */
async function orFixture<T>(s: Src, h: Help, live: () => Promise<T>, from: string): Promise<{ v: T; from: string }> {
  try { return { v: await live(), from }; }
  catch (e) {
    if (!s.fixture) throw e;
    return { v: h.readJson(s.fixture) as T, from: `${s.fixture} (${from} did not answer)` };
  }
}

// ---- waits: what needs Marco's press across the project ----
type Pr = { number: number; title: string; isDraft: boolean; url: string; updatedAt: string; baseRefName?: string; statusCheckRollup?: { conclusion?: string | null; status?: string | null; state?: string | null }[] };
type Issue = { number: number; title: string; url: string; updatedAt: string; createdAt?: string; assignees?: { login: string }[]; labels?: { name: string }[] };
/** a PR's checks in one word (pure): green when every check passed or was skipped, red when one failed, else waiting */
export function checksOf(rollup: Pr["statusCheckRollup"] = []): "green" | "red" | "waiting" {
  if (!rollup.length) return "waiting";
  const word = (c: NonNullable<Pr["statusCheckRollup"]>[number]) => (c.conclusion ?? c.state ?? c.status ?? "").toUpperCase();
  if (rollup.some((c) => ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"].includes(word(c)))) return "red";
  if (rollup.every((c) => ["SUCCESS", "SKIPPED", "NEUTRAL"].includes(word(c)))) return "green";
  return "waiting";
}
/** a title as a person says it (pure): the tracker's prefixes ("product: engine: ", "work · decision: ") and the trailing
 *  issue mark ("(#837)", "(Part of #821)") dropped, the first letter upper case */
export function cleanTitle(t: string): string {
  let x = t.trim().replace(/\s*\((?:part of |fixes |closes )?#\d+(?:,\s*#\d+)*\)\s*$/i, "");
  for (let i = 0; i < 3; i++) x = x.replace(/^[a-z][a-z0-9 ·-]{0,24}:\s+/i, (m) => (/\s{2,}/.test(m) ? m : ""));
  return x ? x[0].toUpperCase() + x.slice(1) : t;
}
/** the areas a login leads, from CODEOWNERS (pure over its text): a `# label <area>:` line opens a section, the owners
 *  on its path lines are its leads */
export function areasLed(codeowners: string, login: string): string[] {
  const out = new Set<string>(); let area = "";
  for (const l of codeowners.split("\n")) {
    const h = /^# label ([a-z]+):/.exec(l);
    if (h) { area = h[1]; continue; }
    if (area && l.startsWith("/") && l.split(/\s+/).includes(`@${login}`)) out.add(area);
  }
  return [...out];
}
/** the rows of "waits on me" (pure over what GitHub said): only what is his press. Green ready PRs (his merge, in their
 *  own place: the press opens the PR), oldest first; open decisions assigned to him or in an area he leads. A PR with
 *  checks running or red waits on its author, not on him */
export function waitsRows(prs: Pr[], decisions: Issue[], now = Date.now(), who: { login?: string; areas?: string[] } = {}): Read {
  const rows: Row[] = prs
    .filter((p) => !p.isDraft && checksOf(p.statusCheckRollup) === "green")
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
    .map((p) => ({ id: `pr-${p.number}`, t: cleanTitle(p.title), href: p.url, note: `#${p.number} · green for ${ago(now - Date.parse(p.updatedAt))}${p.baseRefName && p.baseRefName !== "main" ? ` · into ${p.baseRefName}` : ""}`, wants: true, press: "open the PR" }));
  const his = (d: Issue) => !who.login || (d.assignees ?? []).some((a) => a.login === who.login) || (d.labels ?? []).some((l) => (who.areas ?? []).includes(l.name));
  for (const d of decisions.filter(his)) rows.push({ id: `d-${d.number}`, t: cleanTitle(d.title), href: d.url, note: `#${d.number} · asked ${ago(now - Date.parse(d.createdAt ?? d.updatedAt))} ago`, wants: true, press: "answer" });
  return { rows, line: rows.length ? `${rows.length} want you` : "nothing waits on you" };
}

// ---- runs: what runs where ----
type Run = { id: string; unit?: string; machine?: string; state: string; why?: string; since?: number; said?: string | null };
type Board = { at?: number; machines?: Record<string, { runs?: Run[]; room_why?: string }>; runs?: Run[] };
/** the night's page (status.json): its builders, each on a machine, alive or not, with its one status line */
type Night = { builders?: { name: string; machine?: string; alive?: boolean; since?: number; status?: string }[] };
const MACHINES: Record<string, string> = { nucbox: "NucBox", legion: "Legion", mac: "MacBook", macbook: "MacBook" };
/** the rows of "runs" (pure over the board): per machine, what works now, what failed and wants a look, what finished in
 *  the last six hours; a machine with nothing running says idle */
export function runsRows(b: Board, board = "", nowS = Date.now() / 1000, night: Night = {}): Read {
  const all: Run[] = [...(b.runs ?? [])];
  for (const n of night.builders ?? []) if (!all.some((a) => a.id === n.name)) all.push({ id: n.name, machine: n.machine, state: n.alive ? "working" : "done", since: n.since, said: n.status ?? null });
  for (const [m, x] of Object.entries(b.machines ?? {})) for (const r of x.runs ?? []) if (!all.some((a) => a.id === r.id)) all.push({ ...r, machine: r.machine ?? m });
  const rows: Row[] = [];
  const machines = [...new Set([...Object.keys(b.machines ?? {}), ...all.map((r) => r.machine ?? "")].filter(Boolean))];
  let on = 0;
  for (const m of machines) {
    const g = MACHINES[m] ?? m, mine = all.filter((r) => (r.machine ?? "") === m);
    const working = mine.filter((r) => r.state === "working" || r.state === "running");
    const failed = mine.filter((r) => r.state === "failed" && r.since && nowS - r.since < 3 * 86_400);
    const done = mine.filter((r) => r.state === "done" && r.since && nowS - r.since < 6 * 3600);
    on += working.length;
    for (const r of working) rows.push({ id: r.id, t: r.id.replace(/^sol-build-/, ""), now: true, group: g, note: r.said ? r.said.slice(0, 80) : r.since ? `${ago((nowS - r.since) * 1000)}` : "running" });
    for (const r of failed) rows.push({ id: r.id, t: r.id.replace(/^sol-build-/, ""), wants: true, press: "read", group: g, note: `failed: ${(r.why ?? "").slice(0, 60)}`, ...(board ? { href: board } : {}) });
    for (const r of done) rows.push({ id: r.id, t: r.id.replace(/^sol-build-/, ""), done: true, group: g, note: "finished" });
    if (!working.length) rows.push({ id: `idle-${m}`, t: "idle", group: g, note: x(b, m) });
  }
  return { rows, line: `${on} on` };
}
const x = (b: Board, m: string) => (b.machines?.[m]?.room_why ?? "").slice(0, 60);

// ---- systems: the registry's view ----
type Rec = { id: string; name?: string; parent?: string | null; state?: string; breaks?: string };
type Live = { health?: Record<string, { lamp?: string }> };
/** the rows of "systems" (pure over the registry and its live lamps): what is broken now, worst first (a red lamp before a
 *  record marked broken), then each area by name with what stands in it; an empty area says nothing stands here */
export function systemsRows(recs: Rec[], live: Live = {}, board = ""): Read {
  const lamp = (id: string) => live.health?.[id]?.lamp ?? "";
  const broken = recs.filter((r) => r.state === "broken" || lamp(r.id) === "red")
    .sort((a, b) => Number(lamp(b.id) === "red") - Number(lamp(a.id) === "red") || a.id.localeCompare(b.id));
  const rows: Row[] = broken.map((r) => ({ id: r.id, t: r.name ?? r.id, wants: true, press: "read", group: "broken now", note: (r.breaks ?? r.id).slice(0, 80), ...(board ? { href: `${board}#${encodeURIComponent(r.id)}` } : {}) }));
  const areas = recs.filter((r) => !r.parent || !r.id.includes("/"));
  for (const a of areas.sort((p, q) => p.id.localeCompare(q.id))) {
    const under = recs.filter((r) => r.id !== a.id && (r.id.startsWith(`${a.id}/`)));
    const liveN = under.filter((r) => r.state === "live").length, br = under.filter((r) => r.state === "broken" || lamp(r.id) === "red").length;
    rows.push({ id: `area-${a.id}`, t: a.name?.split(",")[0] ?? a.id, group: "areas", note: under.length ? `${liveN} live${br ? ` · ${br} broken` : ""}` : "nothing stands here" });
  }
  return { rows, line: `${broken.length} broken` };
}

// ---- due: a Home class folder's next due thing (#1092, Home) ----
const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** a date written in a sticky ("due Nov 20", "Thu Nov 12", "11/20"), the next one on or after today's year (pure) */
export function dueIn(text: string, now = new Date()): Date | null {
  const t = text.toLowerCase();
  let m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/.exec(t);
  let mo: number | null = null, d: number | null = null;
  if (m) { mo = MON.indexOf(m[1]); d = Number(m[2]); }
  else if ((m = /\b(\d{1,2})\/(\d{1,2})\b/.exec(t))) { mo = Number(m[1]) - 1; d = Number(m[2]); }
  if (mo === null || d === null || mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  const at = new Date(now.getFullYear(), mo, d);
  // a date well behind today is next year's (written in December for January)
  if (at.getTime() < now.getTime() - 60 * 86_400_000) at.setFullYear(now.getFullYear() + 1);
  return at;
}
/** a fact the folder knows (the shape the walk kept, the part due reads): what, its value, where it came from */
export type DueFact = { k: string; v: string; src?: string; state?: string };
const STOP = new Set(["with", "from", "your", "this", "that", "into", "about", "due", "the", "and", "for"]);
const wordsOf = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)));
/** where a fact came from, in words: "the syllabus" for a syllabus, else the file's name without its folder or kind */
const fromWords = (src = "") => (/syllab/i.test(src) ? "the syllabus" : src.split(/[\\/]/).pop()?.replace(/\.[a-z0-9]+$/i, "") || "what the folder knows");
/** the press for a due thing, by what it is (pure): an exam or a quiz is prepared for, a reading is read, the rest
 *  started (the designer's NOW 3 of 03:20) */
export const dueWord = (t: string) => (/\b(exam|midterm|final|quiz|test)s?\b/i.test(t) ? "prepare" : /\b(read|reading|chapter|article)s?\b/i.test(t) ? "read" : "start");
/** the figure for a day count, four characters at most: "4 d", "today", "late" */
const figOfDays = (d: number | null) => (d === null ? "" : d < 0 ? "late" : d === 0 ? "today" : `${d} d`);
/** one fact as Jev is asked of it, once (pure) */
export const factKey = (f: DueFact) => `${f.k}\u0001${f.v}`;
/** is this dated fact his to do, by its plain words, on this machine (pure): a fact's words are a note's body and are
 *  never sent (the lead's 06:16, the designer's 06:31; JEV 6 is not asked). Yes: work handed in or sat; no: when the
 *  class meets, a break, the term; neither: "ghost", the last row, "maybe due" */
const HIS = /\b(problem sets?|psets?|papers?|essays?|exams?|midterms?|finals?|quiz(zes)?|labs?|projects?|proposals?|presentations?|assignments?|homework|due|submit(ted)?|deliverables?|reports?)\b/i;
const NOT_HIS = /\b(office hours?|lectures?|class meets|meets|term|semester|break|holiday|recess|last day|first day|no class)\b/i;
export function dueTier(f: DueFact): Tier {
  const words = `${f.k} ${f.v}`;
  if (NOT_HIS.test(words) && !HIS.test(f.k)) return "none";
  if (HIS.test(words)) return "acts";
  return "ghost";
}
/** the tiers of the dated facts, worked out here (pure) */
export function dueTiers(facts: DueFact[]): Map<string, Tier> {
  const out = new Map<string, Tier>();
  for (const f of facts) if (f && typeof f.k === "string" && typeof f.v === "string") out.set(factKey(f), dueTier(f));
  return out;
}
/** kept for the tests' stubs from before (nothing is asked any more) */
export const setDueJev = (_f: unknown) => {};

/** the rows of "due" (pure over the folder's stickies.md and what it knows): open stickies and the dated facts the
 *  stickies do not cover yet, nearest first; one due within a week wants you with "start" (the folder's agent does it
 *  while you watch; for a fact, its sticky is put up first). The note says where a row is from, the figure when (the
 *  designer's NOW 2 of 02:22: the tile says what the stickies beside it do not). A fact and a sticky on the same day
 *  sharing a word are one row, the sticky's */
export function dueRows(stickies: string, now = new Date(), facts: DueFact[] = [], tiers: Map<string, Tier> = new Map()): Read {
  const items = stickies.split("\n").map((l) => /^- \[([ xX])\] (.+)$/.exec(l)).filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ done: m[1] !== " ", text: m[2].replace(/ ← now$/, "").trim() }));
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const daysOf = (at: Date | null) => (at ? Math.round((at.getTime() - day0) / 86_400_000) : null);
  type Due = { t: string; note: string; days: number | null; id: string; at: Date | null };
  const all = items.map((x) => ({ ...x, at: dueIn(x.text, now) }));
  const open: Due[] = all.filter((x) => !x.done).map((x) => {
    const [t, ask = ""] = x.text.split(" — "), days = daysOf(x.at), a = ask.trim();
    return { t: t.trim(), id: `due-${t.trim().toLowerCase().slice(0, 60)}`, at: x.at, days, note: days === null && a ? `your sticky · ${a}` : a && !dueIn(a, now) ? `your sticky · ${a}` : "your sticky" };
  });
  const maybe: Due[] = [];
  // the facts with a date the stickies do not hold yet (done stickies count: a done thing is not due again)
  const same = (f: { at: Date; k: string }) => all.some((x) => x.at && x.at.getTime() === f.at.getTime() && [...wordsOf(x.text)].some((w) => wordsOf(f.k).has(w)));
  for (const f of facts) {
    if (!f || typeof f.k !== "string" || typeof f.v !== "string" || f.state === "gone" || /\bleft\b/i.test(f.k)) continue;
    const at = dueIn(f.v, now) ?? dueIn(f.k, now);
    if (!at || same({ at, k: f.k })) continue;
    const days = daysOf(at);
    if (days === null || days < -7) continue;   // long past: not something to do now
    const t = f.k.trim().replace(/^./, (c) => c.toUpperCase()).slice(0, 120);
    // a sticky of that name he has done: the row is put away with it (one state: the sticky is the row's placement)
    if (all.some((x) => x.done && x.text.split(" — ")[0].trim().toLowerCase() === t.toLowerCase())) continue;
    // a sticky of the same name (one "start" put up from this fact) is that row: it keeps the fact's date
    const same1 = open.find((x) => x.t.toLowerCase() === t.toLowerCase());
    if (same1) { if (same1.days === null) { same1.at = at; same1.days = days; } continue; }
    // is this dated fact his to do (dueTier, by its words, here)? none: not a row; ghost: the last row, "maybe due",
    // never yellow; acts or no word known: the plain rule, a row
    const tier = tiers.get(factKey(f));
    if (tier === "none") continue;
    if (tier === "ghost") { maybe.push({ t, id: `due-${t.toLowerCase().slice(0, 60)}`, at, days, note: `maybe due · on ${fromWords(f.src)}` }); continue; }
    open.push({ t, id: `due-${t.toLowerCase().slice(0, 60)}`, at, days, note: `on ${fromWords(f.src)} · no sticky yet` });
  }
  open.sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9));
  maybe.sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9));
  const day = (at: Date | null) => (at ? `${at.toLocaleDateString("en-US", { weekday: "short" })} ${at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "");
  const rows: Row[] = [...open.map((x) => ({
    id: x.id, t: x.t, note: x.at ? `${day(x.at)} · ${x.note}` : x.note, ...(figOfDays(x.days) ? { fig: figOfDays(x.days) } : {}),
    ...(x.days !== null && x.days <= 7 ? { wants: true } : {}), press: dueWord(x.t),
  })), ...maybe.map((x) => ({ id: x.id, t: x.t, maybe: true as const, note: x.at ? `${day(x.at)} · ${x.note}` : x.note, ...(figOfDays(x.days) ? { fig: figOfDays(x.days) } : {}), press: dueWord(x.t) }))];
  const next = open.find((x) => x.days !== null && x.days >= 0);
  return { rows, line: next ? (next.days === 0 ? "today" : `${next.days} d`) : open.length ? `${open.length}` : "" };
}

// ---- night: tonight's builders and the questions they put to him ----
type Builder = { name: string; short?: string; title?: string; machine?: string; alive?: boolean | string; status?: string; done?: string; pr?: number | string | { number?: number; url?: string } | null; ended?: boolean | string;
  /** when it started (unix seconds), its lead's notes, its stills (a list, or the page's text of one) */
  since?: number | string; lead?: string; stills?: unknown[] | string };
/** a builder's yes/no questions from its done.txt (pure): the lines under "DECISION(S) FOR MARCO", each with its default */
export function questionsOf(done = ""): { q: string; dflt?: string }[] {
  const i = done.search(/DECISIONS? FOR MARCO/);
  if (i < 0) return [];
  const out: { q: string; dflt?: string }[] = [];
  for (const l of done.slice(i).split("\n").slice(1)) {
    if (!l.trim()) { if (out.length) break; continue; }
    if (/^[A-Z][A-Z ,()'-]{6,}/.test(l.trim())) break;   // the next section's head
    const m = /^\s*(?:\d+\.|-)\s+(.+)$/.exec(l);
    if (!m) continue;
    const d = /\(?\s*default:?\s*([^)]*)\)?\s*\.?$/i.exec(m[1]) ?? /\((yes|no)\)\s*$/i.exec(m[1]);
    out.push({ q: m[1].replace(/\s*\(?\s*default:?[^)]*\)?\s*\.?$/i, "").replace(/\s*\((yes|no)\)\s*$/i, "").replace(/\s*Default:.*$/, "").trim(), ...(d ? { dflt: d[1].trim().replace(/\.$/, "") } : {}) });
  }
  return out;
}
/** the rows of "the night" (pure over the night's page): each builder's questions to him in front, then the builders
 *  by name with their one line, the running ones breathing */
const truthy = (v: unknown) => v === true || v === "True" || v === "true";
/** when a part was joined, by any lead's notes: "joined: <part>" (or its own "JOINED at"), the time of the note's
 *  heading ("## 02:57, from the orchestrator") when it has one (pure) */
export function joinedAt(b: Builder, all: Builder[]): { at?: string } | null {
  const key = (b.short ?? b.name.replace(/^n\d+-/, "")).toLowerCase();
  const find = (text: string, re: RegExp) => {
    const m = re.exec(text);
    if (!m) return null;
    const head = [...text.slice(0, m.index).matchAll(/^## (\d{1,2}:\d{2})/gm)].pop();
    return head ? { at: head[1] } : {};
  };
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const own = find(b.lead ?? "", /\bJOINED at\b/);
  if (own) return own;
  for (const o of all) { const f = find(o.lead ?? "", new RegExp(`\\bjoined: ${esc}\\b`, "i")); if (f) return f; }
  return null;
}
/** a default as a few words: its first sentence, at most 40 letters, cut at a word (pure) */
export function shortDefault(d: string): string {
  const one = d.split(/(?<=[.;:])\s/)[0].replace(/[.;:]$/, "").trim();
  if (one.length <= 40) return one;
  const cut = one.slice(0, 40), sp = cut.lastIndexOf(" ");
  return `${(sp > 20 ? cut.slice(0, sp) : cut).replace(/[,;]$/, "")}…`;
}
const stillsOf = (v: Builder["stills"]) => (Array.isArray(v) ? v.length : typeof v === "string" ? (v.match(/'name':|"name":/g) ?? []).length : 0);
/** the rows of "the night" (pure; the designer's NOW 3 of 02:22: what he can try comes before what he is asked):
 *  first each part he can try (its done.txt starts "READY TO JOIN", or a lead wrote "joined: <part>"), press "try" to its
 *  PR's What to try; then each part that stopped before its end ("read"); then each question a part put to him, press
 *  "keep" (the default stays, the row is put away) with a quiet "change it" to the PR; then the parts still at work,
 *  by title and how long. The line: how many he can try or must answer, else how many are on */
export function nightRows(builders: Builder[], prUrl = (n: number | string) => `https://github.com/sol-mif/sol-dev/pull/${n}`, now = Date.now() / 1000): Read {
  const on = (b: Builder) => truthy(b.alive);
  // the page gives a PR as a number, as { number, url }, or "None" while the part's done.txt already names it
  const link = (b: Builder) => {
    const p = b.pr;
    if (p && p !== "None") { if (typeof p === "object") return p.url ?? (p.number ? prUrl(p.number) : null); return prUrl(p); }
    const m = /\bPR #(\d+)/.exec(b.done ?? "");
    return m ? prUrl(m[1]) : null;
  };
  const who = (b: Builder) => b.short ?? b.name.replace(/^n\d+-/, "");
  const title = (b: Builder) => b.title ?? b.name;
  const ready = (b: Builder) => /^\s*READY TO JOIN/.test(b.done ?? "") ? { how: "ready to join" } : (() => { const j = joinedAt(b, builders); return j ? { how: `joined${j.at ? ` ${j.at}` : ""}` } : null; })();
  const tries: Row[] = [], stopped: Row[] = [], asks: Row[] = [], working: Row[] = [];
  for (const b of builders) {
    const href = link(b), r = ready(b), n = stillsOf(b.stills);
    // try: the PR's What to try, else the address its done.txt gives under HOW MARCO TRIES IT (a part with no PR)
    const tryAt = href ? `${href}#user-content-what-to-try` : /HOW MARCO TRIES IT[^\n]*\n?[^]*?(https?:\/\/[^\s)]+)/.exec(b.done ?? "")?.[1]?.replace(/[.,;]$/, "");
    if (r) tries.push({ id: `${b.name}-try`, t: title(b), wants: true, press: "try", note: `${r.how}${n ? ` · ${n} stills` : ""}`, ...(tryAt ? { href: tryAt } : {}) });
    else if (truthy(b.ended) || (!on(b) && b.done)) stopped.push({ id: `${b.name}-stopped`, t: title(b), wants: true, press: "read", note: "stopped before its end", ...(href ? { href } : {}) });
    for (const [k, q] of questionsOf(b.done).entries()) {
      asks.push({ id: `${b.name}-q${k}`, t: q.q, wants: true, press: "keep", note: `${who(b)} · default: ${shortDefault(q.dflt ?? "as it is")}, in effect`, ...(href ? { href } : {}) });
    }
    if (!r && on(b)) {
      const since = Number(b.since), h = Number.isFinite(since) && since > 0 ? Math.max(0, now - since) / 3600 : null;
      working.push({ id: b.name, t: title(b), now: true, ...(h !== null ? { note: h < 1 ? `${Math.round(h * 60)} min` : `${Math.round(h * 10) / 10} h` } : {}) });
    }
  }
  const want = tries.length + stopped.length + asks.length;
  return { rows: [...tries, ...stopped, ...asks, ...working], line: want ? `${want}` : `${builders.filter(on).length} on` };
}

/** a repository's open issues as rows (pure): its title, "#n · its labels", its link; one marked `now` is being worked */
export function issuesRows(issues: Issue[], now = Date.now()): Read {
  // the note says what the presses did not (its labels were pressed): its number and how long since it moved
  const rows: Row[] = issues.map((i) => {
    const ls = (i.labels ?? []).map((l) => l.name), at = Date.parse(i.updatedAt);
    return { id: `issue-${i.number}`, t: i.title, note: `#${i.number}${Number.isFinite(at) ? ` · ${ago(now - at)}` : ""}`, href: i.url, ...(ls.includes("now") ? { now: true } : {}) };
  });
  return { rows, line: `${rows.length}` };
}
/** a repository's open pull requests as rows (pure): its title, "#n · draft | green | red | waiting", its link */
export function prsRows(prs: Pr[]): Read {
  const rows: Row[] = prs.map((p) => ({ id: `pr-${p.number}`, t: p.title, note: `#${p.number} · ${p.isDraft ? "draft" : checksOf(p.statusCheckRollup)}`, href: p.url }));
  return { rows, line: `${rows.length}` };
}

// ---- the starters: what any folder can be read from with only the folder (morning round of 11-13) ----
/** names never walked into for "recent": what a tool writes, not what a person works on */
const SKIP = new Set(["node_modules", "target", "dist", "build", "__pycache__", "venv"]);
/** the folder's files, each with when it last changed: three levels deep, no dot names, no links, 3000 at most */
export function filesIn(cwd: string): { path: string; at: number }[] {
  const out: { path: string; at: number }[] = [];
  let seen = 0;
  const walk = (d: string, depth: number) => {
    let names: string[] = [];
    try { names = readdirSync(d); } catch { return; }
    for (const n of names) {
      if (++seen > 3000) return;
      if (n.startsWith(".") || SKIP.has(n)) continue;
      const f = join(d, n);
      let st; try { st = lstatSync(f); } catch { continue; }
      if (st.isSymbolicLink()) continue;   // a link may lead out of the folder: not followed
      if (st.isDirectory()) { if (depth < 3) walk(f, depth + 1); }
      else if (st.isFile()) out.push({ path: relative(cwd, f), at: st.mtimeMs });
    }
  };
  walk(cwd, 0);
  return out;
}
/** the rows of "recent" (pure): the twelve files changed last, newest first, each with how long ago; names only, never
 *  what is in them */
export function recentRows(files: { path: string; at: number }[], now = Date.now()): Read {
  const rows: Row[] = [...files].sort((a, b) => b.at - a.at).slice(0, 12).map((f) => ({ id: `f:${f.path}`, t: f.path.slice(0, 200), fig: ago(now - f.at) }));
  return { rows, line: rows.length ? `${files.length} file${files.length === 1 ? "" : "s"}` : "no files yet" };
}
/** the rows of "git" (pure over `git status --porcelain --branch` and `git log --format=%h%x09%ct%x09%s`): the branch,
 *  then what is changed and not committed, then the last commits */
export function gitRows(status: string, log: string, now = Date.now()): Read {
  const lines = status.split("\n").filter(Boolean);
  const head = lines[0]?.startsWith("## ") ? lines.shift()!.slice(3) : "";
  const branch = head.replace(/^No commits yet on /, "").split("...")[0].trim() || "no branch";
  const ahead = /ahead (\d+)/.exec(head)?.[1], behind = /behind (\d+)/.exec(head)?.[1];
  const changed = lines.map((l) => ({ how: l.slice(0, 2), path: l.slice(3).split(" -> ").pop()!.trim() })).filter((c) => c.path);
  const word = (h: string) => (h === "??" ? "new" : h.includes("D") ? "deleted" : h.includes("A") ? "added" : h.includes("R") ? "renamed" : "changed");
  const rows: Row[] = [{ id: "branch", t: `on ${branch}`, note: [changed.length ? `${changed.length} not committed` : "nothing to commit", ahead ? `${ahead} to push` : "", behind ? `${behind} to pull` : ""].filter(Boolean).join(" · "), group: "now" }];
  for (const c of changed.slice(0, 12)) rows.push({ id: `c:${c.path}`, t: c.path.slice(0, 200), note: word(c.how), group: "not committed" });
  for (const l of log.split("\n").filter(Boolean).slice(0, 8)) {
    const [h, ct, ...subj] = l.split("\t");
    if (!h || !subj.length) continue;
    rows.push({ id: `g:${h}`, t: subj.join("\t").slice(0, 200), note: h, fig: ago(now - Number(ct) * 1000), group: "last commits" });
  }
  return { rows, line: changed.length ? `${changed.length} not committed` : "clean" };
}
// read-only toward the folder: no index refresh or index.lock (an agent's commit at the same moment never fails on it),
// no fsmonitor program from the folder's own .git/config, names as written (été.md, not a quoted octal string)
const git = (cwd: string, args: string[]) => new Promise<string>((ok, no) => {
  execFile("git", ["-c", "core.fsmonitor=false", "-c", "core.quotePath=false", ...args], { cwd, timeout: 10_000, maxBuffer: 4 << 20, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } }, (err, out) => (err ? no(new Error(/not a git repository/i.test(String(err.message)) ? "this folder is not a git repository" : "git did not answer")) : ok(String(out))));
});

export const BUILTINS: Record<string, Builtin> = {
  async recent(cwd) { return { ...recentRows(filesIn(cwd)), from: "the folder's files" }; },
  async git(cwd) {
    const status = await git(cwd, ["status", "--porcelain=v1", "--branch"]);
    // a repository with no commit yet has no log: its status alone
    const log = await git(cwd, ["log", "-8", "--format=%h%x09%ct%x09%s"]).catch(() => "");
    return { ...gitRows(status, log), from: "git" };
  },
  async issues(cwd, s) {
    const args = ["issue", "list", "--state", "open", "--limit", "60", "--json", "number,title,url,updatedAt,labels"];
    for (const l of s.labels ?? []) args.push("--label", l);
    return { ...issuesRows(await gh(cwd, args) as Issue[]), from: `GitHub's issues${s.labels?.length ? ` · ${s.labels.join(" · ")}` : ""}` };
  },
  async prs(cwd) {
    return { ...prsRows(await gh(cwd, ["pr", "list", "--state", "open", "--limit", "60", "--json", "number,title,isDraft,url,updatedAt,statusCheckRollup"]) as Pr[]), from: "GitHub's pull requests" };
  },
  async night(_cwd, s, h) {
    const url = s.url ?? (nucbox() ? onNucbox(8813, "/status.json") : "the NucBox");
    const { v, from } = await orFixture(s, h, () => h.getJson(onUrl(s.url, 8813, "/status.json"), 5000) as Promise<{ builders?: Builder[] }>, url);
    return { ...nightRows((v as { builders?: Builder[] }).builders ?? []), from };
  },
  async due(_cwd, _s, h) {
    const text = h.readText?.("stickies.md") ?? null;
    let facts: DueFact[] = [];
    try { const g = JSON.parse(h.readText?.("ground.json") ?? "null") as { facts?: unknown } | null; if (Array.isArray(g?.facts)) facts = g.facts as DueFact[]; } catch { /* no knowledge yet */ }
    if (text === null && !facts.length) return { rows: [], line: "", from: "stickies.md (not written yet)" };
    return { ...dueRows(text ?? "", new Date(), facts, dueTiers(facts.filter((f) => f && typeof f.v === "string" && !!(dueIn(f.v, new Date()) ?? dueIn(f.k, new Date()))))), from: facts.length ? "what the folder knows, then your stickies" : "stickies.md" };
  },
  async waits(cwd, s, h) {
    const { v, from } = await orFixture(s, h, async () => {
      const prs = await gh(cwd, ["pr", "list", "--state", "open", "--limit", "60", "--json", "number,title,isDraft,url,updatedAt,baseRefName,statusCheckRollup"]) as Pr[];
      const decisions = await gh(cwd, ["issue", "list", "--state", "open", "--label", "decision", "--limit", "30", "--json", "number,title,url,updatedAt,createdAt,assignees,labels"]) as Issue[];
      const login = String(await gh(cwd, ["api", "user", "--jq", "{l: .login}"]).then((u) => (u as { l?: string }).l ?? "").catch(() => ""));
      return { prs, decisions, login };
    }, "GitHub");
    const o = v as { prs?: Pr[]; decisions?: Issue[]; login?: string };
    const login = o.login || undefined;
    const areas = login ? areasLed(h.readText?.(".github/CODEOWNERS") ?? "", login) : [];
    return { ...waitsRows(o.prs ?? [], o.decisions ?? [], Date.now(), { login, areas }), from };
  },
  async runs(_cwd, s, h) {
    const url = s.url ?? (nucbox() ? onNucbox(8811) : "the NucBox");
    const { v, from } = await orFixture(s, h, () => h.getJson(onUrl(s.url, 8811, "/"), 5000) as Promise<Board>, url);
    // tonight's builders, when the night's page answers (a night that is not on says nothing)
    const nightAt = s.night ?? (nucbox() ? onNucbox(8813, "/status.json") : null);
    const night = nightAt ? await h.getJson(nightAt, 4000).catch(() => ({})) as Night : {};
    return { ...runsRows(v as Board, url, Date.now() / 1000, night), from };
  },
  async systems(_cwd, s, h) {
    // SOL_SYSTEMS_BOARD first (agent/areas.ts, #1093), else the NucBox's host (SOL_NUCBOX); no address in the repo
    const base = (s.url ?? SYSTEMS_BOARD ?? (nucbox() ? onNucbox(8815, "") : "the NucBox")).replace(/\/$/, "");
    // the board, else the registry's own records in the folder (part 5's sol/systems, joined: no health read, said so),
    // else the fixture
    const { v, from } = await orFixture(s, h, async () => {
      try {
        if (!s.url && !nucbox()) throw new Error(NO_NUCBOX);
        const reg = await h.getJson(`${base}/api/registry`, 6000) as { records?: unknown };
        const live = await h.getJson(`${base}/api/live`, 6000).catch(() => ({}));
        return { records: reg.records, live, from: base };
      } catch (e) {
        const files = h.jsonFiles?.("sol/systems/records") ?? [];
        if (!files.length) throw e;
        const records = files.flatMap((f) => { try { const r = h.readJson(f) as Rec; return r && typeof r.id === "string" ? [r] : []; } catch { return []; } });
        return { records, live: {}, from: "sol/systems/records (the board did not answer: health not read)" };
      }
    }, base);
    const o = v as { records?: Rec[] | Record<string, Rec>; live?: Live; from?: string };
    const recs = Array.isArray(o.records) ? o.records : Object.values(o.records ?? {});
    return { ...systemsRows(recs, o.live ?? {}, o.from === base || !o.from ? `${base}/` : ""), from: o.from && o.from !== base ? o.from : from };
  },
};

export async function builtinSource(cwd: string, s: { name: string; url?: string; fixture?: string; night?: string }, h: Help): Promise<Read> {
  const f = BUILTINS[s.name];
  if (!f) throw new Error(`no built-in source "${s.name}" (there are: ${Object.keys(BUILTINS).join(", ")})`);
  return f(cwd, s, h);
}
