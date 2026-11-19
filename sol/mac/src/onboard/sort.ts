// The one onboarding's sorter (#1088): the person's few sentences make the parts of their life (the folders), and every
// fact the explorer found is put where it will live: a folder, or the person's own record ("you"). What it cannot be sure
// of comes back as a confirm, never a form: two sources that disagree, a name it guessed, a routine it inferred, a thing
// that touches what the person said was off-limits. Pure, no React; tested in src/onboard-sort.test.ts.

import type { SetupRead } from "./setup.ts";
import type { Reach } from "./places.ts";

export type Kind = "machine" | "ai" | "session" | "tool" | "event" | "file" | "project" | "place";
/** a found thing and its proof: `src` says where it was read, `via` through what (a connector's way: "claude account",
 *  "claude code", "codex", "gh", "gog"; a session list's folder), `n` how many times it was counted there */
export type Found = { id: string; k: string; v: string; src: string; kind: Kind; sure: boolean; when?: string; repeats?: boolean; hint?: string | null; owner?: string; titles?: string[]; open?: boolean; signed?: boolean; who?: string; stop?: string;
  via?: string; n?: number; tool?: string; path?: string; reach?: "export"; ask?: string; at?: string };
/** a thing the explorer left unread, and why (#1217): the consent said no (or Sol never opens it), it could not be
 *  reached, or there was nothing there */
export type Skip = { what: string; why: "denied" | "unreachable" | "nothing" };
/** a stop as the explorer writes it while it works: `open` the source open now, `read` the rows looked at so far */
export type Stop = { id: string; state: "now" | "done" | "none" | "refused" | "skipped"; line: string; facts: Found[]; open?: string; read?: number; skips?: Skip[] };
export type Explored = { v: 1; made: string; home: string; stops: Stop[]; done?: string; setup?: SetupRead; reach?: Reach };   // reach: what is signed in, by presence (explore.mjs stop 0, places.ts)   // setup: the person's own AI setup (explore.mjs readSetup, #1423)

/** the families words can name, and "found": a folder surmised from the person's own AI sessions (#1223), never a fixed list */
export type Part = "school" | "work" | "life" | "build" | "found";
export type Area = { id: string; name: string; part: Part; said: string; facts: string[] };
export type Confirm = { id: string; q: string; why: string; yes: string; no: string; into?: { area: string; label: string }; fact?: string; area?: string; kind: "conflict" | "guess" | "routine" | "private" | "found" };
export type Sorted = { areas: Area[]; you: string[]; off: string[]; confirms: Confirm[]; place: Record<string, string> };

/** a name from disk inside a pattern, taken as itself ("Invoices (2025)", "C++") */
export const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const CODE = /\b([A-Z]{2,4})\s?(\d{3})\b/;
const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
// ids Home keeps for itself: the person's record, its own two views, and the sorter's "not placed". A folder is never one
const KEPT_IDS = new Set(["you", "home", "world", "none"]);

// the families a sentence can open, and what names a folder from it; the first that matches a clause wins. #1122: a told
// part is never dropped for want of a word: a cafe is work, a sister is family, selling things is its own side part
// (part "work", named by what is sold); one folder per family, so a side thing stands beside the job. Local only.
const PLACE = /\b(bakery|clinic|shop|startup|caf[eé]|restaurant)(?![a-z\u00e0-\u00ff])/i;
const KIN = /\b(sisters?|brothers?|siblings?|mom|mum|dad|mother|father|partner|wife|husband|grand\w+|cousins?)\b/i;
const SOLD = /\bsell(?:s|ing)?\s+(?:my\s+|some\s+|own\s+|handmade\s+)*([a-z]+)/i;
const FAMILIES: { part: Part; test: RegExp; name: (c: string) => string }[] = [
  { part: "school", test: /\b(school|class(es)?|major|university|college|studying|semester|course|degree|year at|student)\b/i,
    name: (c) => c.match(/\bat ([A-Z][\w&'-]+(?: [A-Z][\w&'-]+)?)/)?.[1] ?? "School" },
  { part: "work", test: /\b(freelanc\w*|clients?|job|work(ing)? (at|for)|startup|company|business|bakery|shop|clinic|shifts?|nurse|team|barista)\b|\b(caf[eé]|restaurant)(?![a-z\u00e0-\u00ff])/i,
    name: (c) => /freelanc|clients?/i.test(c) ? "Clients" : (c.match(/\b(?:at|for|run|own|building|founded|started|with) (?:a |an |the |my )?([A-Z][\w&'-]+|bakery|clinic|shop|startup|caf[eé]|restaurant)/)?.[1] ?? c.match(PLACE)?.[1])?.replace(/^\w/, (x) => x.toUpperCase()) ?? "Work" },
  { part: "life", test: /\b(training|marathon|half marathon|run(ning)?|gym|climb\w*|choir|family|kids?|parent|daughter|son|health|garden\w*|sisters?|brothers?|siblings?|mom|mum|dad|mother|father|partner|wife|husband|grand\w+|cousins?)\b/i,
    name: (c) => { const m = c.match(/\b(half marathon|marathon|climb\w*|choir|family|kids|gym|running)\b/i)?.[1]; return m ? (/^climb/i.test(m) ? "Climbing" : cap(m)) : KIN.test(c) ? "Family" : "Life"; } },
  { part: "build", test: /\b(side project|building|code|coding|an app|open source|hacking on)\b/i, name: () => "Projects" },
  { part: "work", test: /\b(sell(s|ing)?|etsy|side (hustle|business|gig)|on the side)\b/i,
    name: (c) => { const w = c.match(SOLD)?.[1]; return w && !/^(on|at|in|online|to|stuff|things?|it|them|for)$/i.test(w) ? cap(w.toLowerCase()) : "Side thing"; } },
];
// words that name the things inside each part, to put a found thing in the right folder
const LEANS: Record<Part, RegExp> = {
  school: /\b(syllab\w*|course|lecture|midterm|exam|homework|canvas|blackboard|moodle|\.edu|studio|crit|class)\b/i,
  work: /\b(invoice|contract|brief|client|proposal|figma|notion|behance|linear|slack|standup|launch|square|supplier|menu|rota|shift|clinic|review call|pitch|market|stall|bakery|order)\b/i,
  life: /\b(run|marathon|race|strava|training|gym|climb\w*|choir|recital|school run|family)\b/i,
  build: /\b(github|repo|code|vercel|hacker news)\b/i,
  found: /(?!)/,   // a surmised folder is matched by its name only
};
/** a folder the person worked in with an AI tool this many times or more becomes a folder of its own when their words
 *  named no part it fits (#1223: a person's folders are whatever the reader surmises, confirmed once) */
export const SURMISE_AT = 3;
const PRIVATE = /\b(messages?|chats?|texts?|whatsapp|mail|email|inbox|dms?|slack)\b/i;
const HOLDS_MESSAGES = /\b(mail\.google|gmail|slack|whatsapp|messages|teams|discord|outlook)\b/i;

/** the parts of a life from a few sentences; nothing said is no folders (the record still fills) */
export function areasOf(said: string): { areas: Area[]; off: string[] } {
  const areas: Area[] = [], off: string[] = [], told = new Set<(typeof FAMILIES)[number]>();
  for (const clause of said.split(/(?<=[.!?;])\s+|\n+/).map((c) => c.trim()).filter(Boolean)) {
    const neg = clause.match(/\b(?:don'?t|do not|never|not)\b[^.]*?\b(?:read|open|look at|touch|see)\b\s+(?:my |at my |into my )?([^.,;!]+)/i);
    if (neg) { off.push(neg[1].trim().replace(/\s+please$/i, "")); continue; }
    // a clause that is about work names the work from the whole clause ("building Kite, a startup"), and is not a project
    const workClause = FAMILIES[1].test.test(clause);
    for (const part of clause.split(/,\s*|\band\b|\bwhile\b/i)) {
      const f = FAMILIES.find((x) => x.test.test(part) && !(workClause && x.part === "build")) ?? (workClause && FAMILIES[3].test.test(part) ? FAMILIES[1] : undefined);
      if (!f) continue;
      const name = f === FAMILIES[1] && workClause ? f.name(clause) : f.name(part.match(/\bat [A-Z]/) ? part : clause.match(/\bat [A-Z]/) && f.part === "school" ? clause : part);
      const id0 = slug(name) || f.part, id = KEPT_IDS.has(id0) ? `${f.part}-${id0}` : id0;   // "I work at Home Depot": work-home
      if (told.has(f) || areas.some((a) => a.id === id)) continue;
      told.add(f);
      areas.push({ id, name, part: f.part, said: part.trim(), facts: [] });
    }
  }
  return { areas, off };
}

/** the sentences as the person's own Claude read them (#1195; the engine's onboard.read, engine/src/onboardRead.ts): the
 *  parts of their life in any language, and what is off-limits in the words this screen acts on. Asked once, at go */
export type Reading = { areas: { id: string; name: string; part: Part; said: string }[]; off: string[]; from?: { word: string; said: string }[] };
const PARTS: Part[] = ["school", "work", "life", "build"];
const WIDE = 3;   // sources one refusal closes from which it is taken for a subject, not a thing (#1195, Frank 11/15)
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
// a folder's name is one line: it heads the folder's own pages (record.ts), so a line break in it is a space
const oneLine = (s: string) => s.replace(/[\u0000-\u001f\u007f\u0085\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();

/** what is off-limits, in the words this screen acts on. A reading never closes less than the rules would: its words,
 *  and with them every word the rules above heard that it does not hold ("I'd prefer it not open my calendar", which a
 *  reader may take for something else). `before` is a reading of the sentences as they were before an edit: its words
 *  stay while the sentence each came from is still there, so an edit elsewhere opens nothing again */
export function offOf(said: string, read?: Reading | null, before?: Reading | null): string[] {
  const off = read ? [...read.off] : [], has = (w: string) => off.some((o) => o.toLowerCase() === w.toLowerCase());
  for (const w of areasOf(said).off) if (!has(w)) off.push(w);
  if (!read) for (const x of before?.from ?? []) if (x.said && said.includes(x.said) && !has(x.word)) off.push(x.word);
  return off;
}

/** a sentence of theirs said back in a line: whole when short, else its start and its end (the end is where "…and
 *  never open my diary" sits) */
export const brief = (s: string, most = 120) => { const c = [...s.trim()]; return c.length <= most ? c.join("") : `${c.slice(0, Math.ceil(most / 2)).join("").trimEnd()} … ${c.slice(-Math.floor(most / 2) + 4).join("").trimStart()}`; };

/** what the engine answered, as the sorter takes it. `read` is null when nothing read them (the switch off, no answer,
 *  a turn that failed): the rules above stand, as before. `ask` is the sentences to put to the person before anything
 *  is opened: one the reader could not tell, and a refusal that closes nothing here (`closes` is the screen's own test
 *  of a word), so "stay out of X" is never taken as heard when nothing was closed for it. A refusal of a subject and not of
 *  a thing ("nothing about my old company"), which the reader closes three sources or more for, is asked too and named in
 *  `wide`: it stays closed everywhere, and the person opens what is safe instead of finding Home empty with no word why */
export function readingOf(m: unknown, said: string, closes: (word: string) => boolean): { read: Reading | null; ask: string[]; wide: string[] } {
  const o = (m && typeof m === "object" ? m : {}) as { by?: unknown; areas?: unknown; off?: unknown; unsure?: unknown };
  const rows = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is { [k: string]: unknown } => !!x && typeof x === "object") : []);
  const ask: string[] = [], wide: string[] = [], put = (s: string) => { if (s && !ask.includes(s)) ask.push(s); };
  for (const u of rows(o.unsure)) {
    const s = str(u.said);
    // with no reading, a sentence the rules above already closed something for is heard; the rest is asked
    if (o.by !== "ai" && areasOf(s).off.some(closes)) continue;
    put(s);
  }
  if (o.by !== "ai") return { read: null, ask, wide };
  const areas: Reading["areas"] = [];
  for (const a of rows(o.areas)) {
    const id = str(a.id), name = oneLine(str(a.name)), part = a.part as Part;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || KEPT_IDS.has(id) || !name || !PARTS.includes(part) || areas.some((x) => x.id === id)) continue;
    areas.push({ id, name, part, said: str(a.said) || said });
  }
  const off: string[] = [], from: { word: string; said: string }[] = [];
  for (const x of rows(o.off)) {
    const word = str(x.word);
    if (!word) continue;
    if (!off.includes(word)) off.push(word);
    if (str(x.said)) from.push({ word, said: str(x.said) });
    if (!closes(word)) put(str(x.said) || word);
    else if (Array.isArray(x.closes) && x.closes.length >= WIDE) { const s = str(x.said) || word; put(s); if (!wide.includes(s)) wide.push(s); }
  }
  return { read: { areas, off, from }, ask, wide };
}

/** where one found thing lives: an area's id, or "you" (the person's record) */
export function placeOf(f: Found, areas: Area[], me?: string): string {
  if (f.kind === "machine" || f.kind === "ai") return "you";
  if (f.kind === "tool") return "you";
  const text = `${f.v} ${f.src} ${f.hint ?? ""} ${(f.titles ?? []).join(" ")}`;
  if (f.kind === "session") {
    // what the person worked on with an AI tool: the folder it names (by its name, its titles, the folder it ran in), else
    // the part its words lean to, else the person's projects; a session in the home folder itself says no part: you
    // (the tool's own name is no clue: "Claude Code" is not code work)
    const said = `${f.v} ${(f.titles ?? []).join(" ")} ${f.path ?? ""}`;
    for (const a of areas) { const n = a.name.replace(/[^\w ]/g, "").trim(); if (n && new RegExp(`\\b${n}\\b`, "i").test(said)) return a.id; }
    for (const p of ["school", "work", "life", "build"] as Part[]) { const a = areas.find((x) => x.part === p); if (a && (LEANS[p].test(said) || (p === "school" && CODE.test(said)))) return a.id; }
    return f.path && f.path !== "~" ? areas.find((a) => a.part === "build")?.id ?? "you" : "you";
  }
  if (f.kind === "project") {
    // a project joins a work folder when it names it (kite-api in Kite), or when the folder is the person's clients and
    // the project is someone else's (lumen-studio/site in Clients); the person's own and the rest go to projects or you
    const work = areas.find((a) => a.part === "work");
    const theirs = !!f.owner && f.owner !== me;
    const wn = work?.name.replace(/[^\w]/g, "") ?? "";
    if (work && ((wn && new RegExp(`\\b${wn}`, "i").test(`${f.v} ${f.owner ?? ""}`)) || (work.id === "clients" && theirs))) return work.id;
    return areas.find((a) => a.part === "build")?.id ?? "you";
  }
  // a folder named by the person beats a family: "Clients/Lumen" goes to Clients
  // (a name with no Latin letter at all, "馬拉松", has no word edge to test: it is looked for as it is written)
  for (const a of areas) {
    const n = a.name.replace(/[^\w ]/g, "").trim(), own = a.name.trim().toLowerCase();
    // (and one Latin letter left of a name in another script, the "A" of "設計 A", is not the name)
    if (n && (n.length > 1 || n === a.name.trim()) ? new RegExp(`\\b${n}\\b`, "i").test(text) : [...own].length >= 2 && text.toLowerCase().includes(own)) return a.id;   // a bare \b would match everything
  }
  const order: Part[] = f.hint === "class" ? ["school"] : f.hint === "client" || f.hint === "job" ? ["work"] : f.hint === "life" ? ["life"] : ["school", "life", "work", "build"];
  // a course code is capitals and three digits ("DES 210"), never a word and a year ("resume 2026"): case counts
  for (const p of order) { const a = areas.find((x) => x.part === p); if (a && (LEANS[p].test(text) || (p === "school" && CODE.test(text)))) return a.id; }
  return "you";
}

/** everything put in its place, and the few things to confirm (at most five). With a reading (#1195) the parts are the
 *  reading's and the off-limits the reading's and the rules' together (offOf); with none they are the rules' */
export function sortAll(said: string, ex: Explored, read?: Reading | null, before?: Reading | null): Sorted {
  const areas = read ? read.areas.map((a): Area => ({ ...a, facts: [] })) : areasOf(said).areas, off = offOf(said, read, before);
  const all = ex.stops.flatMap((s) => s.facts);
  // folders surmised from the sessions (#1223): a folder worked in often, outside the home, that no told part takes (by
  // its name or its words) and with no projects part to fall to, is a part of its own, asked once below
  const found: Area[] = [], surmised = new Map<string, string>();
  if (!areas.some((a) => a.part === "build"))
    for (const f of all.filter((x) => x.kind === "session" && x.path && x.path !== "~" && (x.n ?? 1) >= SURMISE_AT)) {
      if (placeOf(f, areas) !== "you") continue;
      const id = slug(f.v);
      if (!id || areas.some((a) => a.id === id)) continue;
      surmised.set(f.id, id);
      if (!found.some((a) => a.id === id)) { const nm = f.v.replace(/[-_]+/g, " ").trim(); found.push({ id, name: nm.charAt(0).toUpperCase() + nm.slice(1), part: "found", said: "", facts: [] }); }
    }
  areas.push(...found);
  const place: Record<string, string> = {};
  const you: string[] = [];
  const me = all.find((f) => f.kind === "tool" && f.who)?.who;
  for (const f of all) {
    // a folder that is only the area's own name ("Clients" in Documents) says nothing new: it is the area itself
    const p = surmised.get(f.id) ?? (f.k === "folder" && areas.some((a) => a.name.toLowerCase() === f.v.toLowerCase()) ? "none" : placeOf(f, areas, me));
    if (p === "none") continue;
    place[f.id] = p;
    if (p === "you") you.push(f.id); else areas.find((a) => a.id === p)!.facts.push(f.id);
  }
  const confirms: Confirm[] = [];
  // 1 two sources that disagree: a one-off date for a class the calendar also has on that weekday at another hour
  for (const d of all.filter((f) => f.kind === "event" && !f.repeats)) {
    const code = d.v.match(CODE)?.[0];
    if (!code) continue;
    const cls = all.find((f) => f.repeats && f.v.includes(code));
    const dDay = d.when?.slice(0, 3), dHour = d.when?.match(/\d+(:\d\d)?[ap]m/)?.[0];
    const cHour = cls?.when?.match(/\d+(:\d\d)?[ap]m/)?.[0];
    if (cls && dDay && cls.when?.includes(dDay) && dHour && cHour && dHour !== cHour)
      confirms.push({ id: `c-${d.id}`, kind: "conflict", fact: d.id, area: place[d.id], q: `${d.v}: ${d.when}?`, why: `${cls.v} meets ${cls.when} the same day; the crit says ${dHour}`, yes: `yes, ${dHour}`, no: `at ${cHour}` });
  }
  // 2 a name it guessed: a folder under a work area the person never named
  const work = areas.find((a) => a.part === "work");
  if (work) for (const f of all.filter((x) => x.k === "folder" && place[x.id] === work.id && x.v !== work.name && !new RegExp(`(^|\\W)${esc(x.v)}(\\W|$)`, "i").test(said)).slice(0, 2))
    confirms.push({ id: `c-${f.id}`, kind: "guess", fact: f.id, area: work.id, q: `${f.v} is a client?`, why: `a folder in ${f.src}`, yes: "yes, a client", no: "not a client" });
  // 3 a routine it inferred: something personal that repeats
  const life = areas.find((a) => a.part === "life");
  const routine = all.find((f) => f.repeats && life && place[f.id] === life.id);
  if (routine) confirms.push({ id: `c-${routine.id}`, kind: "routine", fact: routine.id, area: life!.id, q: `${routine.v}, ${routine.when}, every week?`, why: "it repeats in your calendar", yes: "keep it", no: "not every week" });
  // 4 what touches the off-limits: places that hold messages, when the person said not to read them
  if (off.some((o) => PRIVATE.test(o))) {
    const held = [...new Set(all.filter((f) => HOLDS_MESSAGES.test(`${f.v} ${f.titles?.join(" ") ?? ""}`)).map((f) => (/gmail|mail\.google/i.test(f.v) ? "Gmail" : f.v)))].slice(0, 3);
    const list = held.length > 1 ? `${held.slice(0, -1).join(", ")} and ${held[held.length - 1]}` : held[0];
    if (held.length) confirms.push({ id: "c-private", kind: "private", q: `Keep ${list} closed to me?`, why: `you said: don't read ${off.find((o) => PRIVATE.test(o))}`, yes: "keep closed", no: "names only" });
  }
  // 5 an AI tool installed but not signed in is no longer asked here: it is a place under the box, with its sign-in
  // (places.ts, #1423)
  // 6 a folder surmised from the sessions: where does it go? Its own folder, inside the folder the person named for work
  // (a project is often part of it), or no folder (its things fold back into their record). The question says the
  // choice, never "a part of your life?" (Marco's try 2026-11-17: read as whether to have it at all)
  for (const a of found) {
    const f = all.find((x) => surmised.get(x.id) === a.id);
    confirms.push({ id: `c-area-${a.id}`, kind: "found", area: a.id, q: `Give ${a.name} its own folder?`, why: f ? f.src : "your AI sessions", yes: "its own folder", no: "no folder",
      ...(work ? { into: { area: work.id, label: `put it in ${work.name}` } } : {}) });
  }
  return { areas, you, off, confirms: confirms.slice(0, 5), place };
}

/** how many presses a person makes in the one flow: go, the confirms, the dial (when moved), "this is my Home" */
export const pressesOf = (s: Sorted, typed: boolean, dialMoved = false) => (typed ? 1 : 0) + 1 + s.confirms.length + (dialMoved ? 1 : 0) + 1;

/** what typed words close, and only that (pure): `closed` is every closed source, `byWords` the ones the words themselves
 *  added, `named` the sources the words name now. A source closed by a press is never opened by words: words only add
 *  what was not closed, and only take back what they added. A press on a source (open or close) takes it out of byWords. */
export function wordsClose(closed: ReadonlySet<string>, byWords: ReadonlySet<string>, named: ReadonlySet<string>, opened: ReadonlySet<string> = new Set()): { closed: Set<string>; byWords: Set<string>; opened: Set<string> } {
  const c = new Set(closed), w = new Set<string>();
  // `opened`: sources a press opened again after the words closed them; the words leave them open while they still name them
  const o = new Set([...opened].filter((id) => named.has(id)));
  for (const id of byWords) { if (named.has(id)) w.add(id); else c.delete(id); }
  for (const id of named) if (!c.has(id) && !o.has(id)) { c.add(id); w.add(id); }
  return { closed: c, byWords: w, opened: o };
}
